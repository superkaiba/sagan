/**
 * Daily lit-review cron. For each enabled lit_sources row of kind=arxiv/rss,
 * asks Claude Code to discover important/relevant papers, fetches configured
 * feeds as a fallback/source supplement, dedupes by arxivId/doi/url, asks
 * Claude for summaries and relevance judgments, then inserts/updates lit_items
 * plus a lit_inbox entry surfaced for today.
 *
 * Seeds a compact default arxiv source set covering ML, NLP, AI, security,
 * and statistical ML, while preserving any user-added sources.
 */
import { XMLParser } from 'fast-xml-parser';
import Anthropic from '@anthropic-ai/sdk';
import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { beliefs, cleanResults, edges, experiments, litInbox, litItems, litSources } from '@sagan/db/schema';
import { db } from '../db.js';
import { env, requireEnv } from '../env.js';
import { log } from '../log.js';
import { recordTrail } from '../trail.js';
import type { JobContext, JobOutcome } from './job-runs.js';

const ARXIV_RSS = 'https://rss.arxiv.org/rss';
const CLAUDE_DISCOVERY_TIMEOUT_MS = 120_000;
const CLAUDE_ANNOTATION_TIMEOUT_MS = 60_000;

interface ArxivConfig {
  /** arxiv category (e.g. cs.LG) or full search query string */
  query: string;
  maxResults?: number;
}

interface RssConfig {
  url?: string;
  feedXml?: string;
  maxResults?: number;
}

interface FetchedEntry {
  externalId: string;
  title: string;
  summary: string;
  authors: string[];
  url: string;
  pdfUrl?: string | null;
  arxivId?: string | null;
  doi?: string | null;
  releasedOn?: string | null;
}

interface RankedEntry extends FetchedEntry {
  score: number;
  category: LitReviewCategory;
  linkedContexts: LinkedContext[];
  summaryMd: string;
  relevanceReasonMd: string;
  threatReasonMd?: string | null;
  sourceTitle: string;
}

const LIT_REVIEW_CATEGORIES = [
  'new_research',
  'linked_to_results',
  'foundational',
  'methods',
  'threats',
  'general_important',
] as const;
type LitReviewCategory = (typeof LIT_REVIEW_CATEGORIES)[number];
const LIT_REVIEW_CATEGORY_SET = new Set<string>(LIT_REVIEW_CATEGORIES);

type LitReviewEdgeType = 'supports' | 'contradicts' | 'method' | 'background' | 'threat' | 'cites';

interface ResearchContext {
  kind: 'clean_result' | 'belief' | 'experiment';
  id: string;
  label: string;
  summary: string;
  terms: string[];
}

interface LinkedContext {
  kind: ResearchContext['kind'];
  id: string;
  edgeType: LitReviewEdgeType;
  reasonMd?: string | null;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
});

const DEFAULT_ARXIV_SOURCES: Array<{ title: string; config: ArxivConfig }> = [
  { title: 'arxiv cs.LG (Machine Learning)', config: { query: 'cs.LG', maxResults: 40 } },
  { title: 'arxiv cs.CL (NLP)', config: { query: 'cs.CL', maxResults: 40 } },
  { title: 'arxiv cs.AI (Artificial Intelligence)', config: { query: 'cs.AI', maxResults: 30 } },
  { title: 'arxiv cs.CR (Cryptography and Security)', config: { query: 'cs.CR', maxResults: 30 } },
  { title: 'arxiv stat.ML (Machine Learning)', config: { query: 'stat.ML', maxResults: 30 } },
];

const discoveredItemSchema = z.object({
  title: z.string().min(1).max(500),
  authors: z.array(z.string().min(1).max(200)).default([]),
  releasedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  abstract: z.string().max(20_000).nullable().optional(),
  summaryMd: z.string().min(1).max(4_000),
  relevanceReasonMd: z.string().min(1).max(4_000),
  threatReasonMd: z.string().max(4_000).nullable().optional(),
  url: z.string().url().nullable().optional(),
  pdfUrl: z.string().url().nullable().optional(),
  arxivId: z.string().max(64).nullable().optional(),
  doi: z.string().max(200).nullable().optional(),
  score: z.number().int().min(0).max(100).default(50),
  category: z.enum(LIT_REVIEW_CATEGORIES).default('new_research'),
  relatedContextIds: z.array(z.string()).max(8).default([]),
});

const discoverySchema = z.object({
  items: z.array(discoveredItemSchema).max(25),
});

const annotationSchema = z.object({
  items: z.array(
    z.object({
      externalId: z.string(),
      score: z.number().int().min(0).max(100),
      category: z.enum(LIT_REVIEW_CATEGORIES).default('new_research'),
      relatedContextIds: z.array(z.string()).max(8).default([]),
      summaryMd: z.string().min(1).max(4_000),
      relevanceReasonMd: z.string().min(1).max(4_000),
      threatReasonMd: z.string().max(4_000).nullable().optional(),
    }),
  ),
});

async function fetchArxivFeed(config: ArxivConfig): Promise<FetchedEntry[]> {
  // The export.arxiv.org/api/query endpoint aggressively rate-limits
  // anything that doesn't look like a browser from a residential IP. The
  // RSS endpoint at rss.arxiv.org is the supported feed-style replacement
  // and is much more tolerant.
  const cat = config.query.replace(/^cat:/, '');
  const url = `${ARXIV_RSS}/${cat}`;
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      accept: 'application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`arxiv ${res.status} ${res.statusText}`);
  const xml = await res.text();
  const parsed = xmlParser.parse(xml) as {
    rss?: { channel?: { item?: unknown } };
  };
  const items = parsed.rss?.channel?.item;
  if (!items) return [];
  const list = Array.isArray(items) ? items : [items];
  const max = config.maxResults ?? 30;
  return list.slice(0, max).map((raw) => {
    const r = raw as {
      title: string;
      link: string;
      description: string;
      'dc:creator'?: string | string[];
      pubDate?: string;
      'dc:date'?: string;
    };
    const authorRaw = r['dc:creator'];
    const authors = authorRaw
      ? (Array.isArray(authorRaw) ? authorRaw : [authorRaw]).flatMap((s) =>
          String(s)
            .replace(/<[^>]+>/g, '')
            .split(/\s*,\s*/)
            .filter(Boolean),
        )
      : [];
    return {
      externalId: r.link, // RSS uses the abs URL as the id
      title: r.title.replace(/\s+/g, ' ').replace(/^\[?[^\]]*\]?\s*/, '').trim(),
      summary: r.description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
      authors,
      url: r.link,
      pdfUrl: r.link.replace('/abs/', '/pdf/'),
      arxivId: arxivIdFromIdField(r.link),
      releasedOn: isoDateFromUnknown(r.pubDate ?? r['dc:date']),
    };
  });
}

async function fetchRssFeed(config: RssConfig): Promise<FetchedEntry[]> {
  const xml = config.feedXml ?? (await fetchRssXml(config.url));
  const parsed = xmlParser.parse(xml) as {
    rss?: { channel?: { item?: unknown } };
    feed?: { entry?: unknown };
  };
  const rssItems = parsed.rss?.channel?.item;
  const atomItems = parsed.feed?.entry;
  const rawItems = rssItems ?? atomItems;
  if (!rawItems) return [];
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];
  const max = config.maxResults ?? 30;
  return list.slice(0, max).flatMap((raw) => {
    const r = raw as Record<string, unknown>;
    const title = cleanText(extractText(r.title));
    const url = linkToString(r.link) || cleanText(extractText(r.guid)) || cleanText(extractText(r.id));
    if (!title || !url) return [];
    const summary = cleanText(
      extractText(r.description) || extractText(r.summary) || extractText(r.content),
    );
    const creator = r['dc:creator'] ?? r.author ?? r.creator;
    const authors = authorsFromUnknown(creator);
    const releasedOn = isoDateFromUnknown(
      extractText(r.pubDate) || extractText(r.published) || extractText(r.updated) || extractText(r['dc:date']),
    );
    return [{
      externalId: cleanText(extractText(r.guid)) || cleanText(extractText(r.id)) || url,
      title,
      summary,
      authors,
      url,
      pdfUrl: url.includes('/abs/') ? url.replace('/abs/', '/pdf/') : null,
      arxivId: arxivIdFromIdField(url),
      releasedOn,
    }];
  });
}

async function fetchRssXml(url: string | undefined): Promise<string> {
  if (!url) throw new Error('rss source missing url');
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Sagan literature review (+https://local.sagan)',
      accept: 'application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`rss ${res.status} ${res.statusText}`);
  return res.text();
}

function arxivIdFromIdField(id: string): string | null {
  // id looks like http://arxiv.org/abs/2406.01234v1
  const m = id.match(/abs\/([0-9]{4}\.[0-9]+)/);
  return m ? m[1]! : null;
}

async function ensureDefaultSources() {
  const existing = await db()
    .select({ title: litSources.title })
    .from(litSources)
    .where(eq(litSources.kind, 'arxiv'));
  const existingTitles = new Set(existing.map((source) => source.title));
  const missing = DEFAULT_ARXIV_SOURCES.filter((source) => !existingTitles.has(source.title));
  if (missing.length === 0) return;
  await db().insert(litSources).values(
    missing.map((source) => ({
      kind: 'arxiv' as const,
      title: source.title,
      config: source.config,
    })),
  );
  log.info('lit-review: seeded default arxiv sources', { inserted: missing.length });
}

async function ensureClaudeDiscoverySource() {
  const title = 'Claude Code literature discovery';
  const existing = await db()
    .select({ id: litSources.id })
    .from(litSources)
    .where(and(eq(litSources.kind, 'semantic_scholar'), eq(litSources.title, title)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const inserted = await db()
    .insert(litSources)
    .values({
      kind: 'semantic_scholar',
      title,
      config: { managed: true, sources: ['arxiv', 'semantic_scholar', 'openreview', 'huggingface_papers'] },
      enabled: true,
    })
    .returning({ id: litSources.id });
  return inserted[0]!.id;
}

export async function runLitReview(context: JobContext = {}): Promise<JobOutcome> {
  requireEnv('ANTHROPIC_API_KEY');
  await ensureDefaultSources();
  const discoverySourceId = await ensureClaudeDiscoverySource();
  const sources = await db()
    .select()
    .from(litSources)
    .where(and(inArray(litSources.kind, ['arxiv', 'rss']), eq(litSources.enabled, true)));

  const today = new Date().toISOString().slice(0, 10);
  const rankingContext = await loadRankingContext();
  let inserted = 0;
  let surfaced = 0;

  const discovered = await discoverWithClaudeCode(rankingContext).catch((err) => {
    log.error('lit-review: Claude Code discovery failed', { err: String(err) });
    return [] as RankedEntry[];
  });
  for (const entry of discovered) {
    const result = await upsertRankedEntry(entry, today, discoverySourceId);
    if (result.inserted) inserted++;
    if (result.surfaced) surfaced++;
  }

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]!;
    // arxiv's published rate limit is 1 req / 3s. Pace between sources.
    if (i > 0) await new Promise((r) => setTimeout(r, 3_500));
    try {
      const entries =
        source.kind === 'rss'
          ? await fetchRssFeed(source.config as RssConfig)
          : await fetchArxivFeed(source.config as ArxivConfig);
      const rankedEntries = await annotateEntriesWithClaude(entries, rankingContext, source.title).catch((err) => {
        log.error('lit-review: Claude annotation failed; falling back to heuristic ranking', {
          sourceId: source.id,
          title: source.title,
          err: String(err),
        });
        return entries.map((entry) => heuristicRankEntry(entry, rankingContext, source.title));
      });
      for (const entry of rankedEntries) {
        const result = await upsertRankedEntry(entry, today, source.id);
        if (result.inserted) inserted++;
        if (result.surfaced) surfaced++;
      }
    } catch (err) {
      log.error('lit-review source failed', {
        sourceId: source.id,
        title: source.title,
        err: String(err),
      });
    }
    await db()
      .update(litSources)
      .set({ lastPolledAt: new Date() })
      .where(eq(litSources.id, source.id));
  }
  log.info('lit-review done', { sources: sources.length, inserted, surfaced });
  await recordTrail({
    action: 'Completed literature review',
    why: 'Refresh the reading queue from configured literature sources.',
    jobRunId: context.jobRunId,
    detail: `${inserted} new item(s), ${surfaced} surfaced item(s), ${sources.length} source(s) checked.`,
  });
  return {
    status: 'completed',
    resultPayload: { sourcesChecked: sources.length, claudeDiscovered: discovered.length, inserted, surfaced },
  };
}

async function discoverWithClaudeCode(contexts: ResearchContext[]): Promise<RankedEntry[]> {
  const prompt = buildDiscoveryPrompt(contexts);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), CLAUDE_DISCOVERY_TIMEOUT_MS);
  const options: Options = {
    cwd: '/tmp',
    env: process.env as Record<string, string>,
    pathToClaudeCodeExecutable: env.CLAUDE_CLI_PATH,
    abortController,
    permissionMode: 'dontAsk',
    tools: ['Bash'],
    allowedTools: ['Bash'],
    disallowedTools: ['Read', 'Grep', 'Glob', 'Edit', 'Write'],
    mcpServers: {},
    strictMcpConfig: true,
    settingSources: [],
    model: 'claude-sonnet-4-6',
    maxTurns: 10,
    maxBudgetUsd: 3,
    persistSession: false,
  };

  try {
    let lastAssistantText = '';
    for await (const message of query({ prompt, options })) {
      lastAssistantText = lastAssistantTextFromMessage(message) || lastAssistantText;
      if (message.type !== 'result') continue;
      if (message.subtype !== 'success') {
        throw new Error(`Claude Code discovery failed: ${message.subtype}`);
      }
      const finalText = message.result?.trim() || lastAssistantText.trim();
      return parseDiscoveredItems(finalText, contexts);
    }
    throw new Error('Claude Code discovery ended without a result');
  } catch (err) {
    if (abortController.signal.aborted) {
      throw new Error(`Claude Code discovery timed out after ${CLAUDE_DISCOVERY_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function buildDiscoveryPrompt(contexts: ResearchContext[]) {
  const contextJson = contexts.slice(0, 24).map((ctx) => ({
    id: ctx.id,
    kind: ctx.kind,
    label: ctx.label,
    summary: ctx.summary,
    terms: ctx.terms.slice(0, 10),
  }));
  return `You are running Sagan's daily literature discovery job.

Use Bash with curl/python as needed to query public sources for new or important AI/ML research.
Do not write files, edit repositories, or mutate external state; only make read-only HTTP queries.

Query sources such as:
- arxiv, especially cs.LG, cs.CL, cs.AI, cs.CR, stat.ML
- Semantic Scholar
- OpenReview
- Hugging Face Papers
- reputable lab blogs or paper pages when they point to papers

Build a daily reading queue across these categories:
- new_research: new papers from the last 14 days
- linked_to_results: papers, including older papers, directly connected to a clean result, belief, or experiment below
- foundational: older background papers worth reading because they explain or precede a current result
- methods: method, evaluation, tooling, benchmark, or implementation papers likely to be useful
- threats: papers that challenge, caveat, contradict, or stress-test current results
- general_important: broadly important AI/ML papers worth knowing about even without a direct context link

Surface clearly relevant new research first, but include older/foundational papers when they are linked to the research context.
Do not include duplicates. Do not invent bibliographic details.
Set relatedContextIds to ids from the current research context only when the paper is actually linked.

Current research context:
${JSON.stringify(contextJson, null, 2)}

Return only JSON with this exact shape:
{
  "items": [
    {
      "title": "paper title",
      "authors": ["Author One", "Author Two"],
      "releasedOn": "YYYY-MM-DD or null",
      "url": "https://...",
      "pdfUrl": "https://... or null",
      "arxivId": "2501.12345 or null",
      "doi": "doi or null",
      "abstract": "abstract text if available",
      "category": "new_research",
      "relatedContextIds": ["context uuid if directly linked"],
      "summaryMd": "1-2 sentence LLM summary of the actual contribution",
      "relevanceReasonMd": "1 concise sentence explaining why this is relevant or generally important",
      "threatReasonMd": "1 concise caveat/threat/null",
      "score": 0
    }
  ]
}

Allowed category values are: ${LIT_REVIEW_CATEGORIES.join(', ')}.
Score 0-100, where 70+ means read soon. Return at most 24 items.`;
}

function lastAssistantTextFromMessage(message: SDKMessage) {
  if (message.type !== 'assistant') return '';
  return (message.message?.content ?? [])
    .map((block) => (block.type === 'text' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function parseDiscoveredItems(text: string, contexts: ResearchContext[]): RankedEntry[] {
  const jsonText = extractJson(text);
  const parsed = discoverySchema.parse(JSON.parse(jsonText));
  return parsed.items.map((item) => {
    const category = coerceCategory(item.category);
    const entry: FetchedEntry = {
      externalId: item.arxivId ? `arxiv:${item.arxivId}` : item.doi ? `doi:${item.doi}` : item.url ?? item.title,
      title: item.title,
      summary: item.abstract ?? '',
      authors: item.authors,
      url: item.url ?? '',
      pdfUrl: item.pdfUrl ?? null,
      arxivId: item.arxivId ?? null,
      doi: item.doi ?? null,
      releasedOn: item.releasedOn ?? null,
    };
    const matchedContexts = matchContextsForEntry(entry, contexts).matchedContexts;
    return {
      ...entry,
      score: item.score,
      category,
      linkedContexts: linkedContextsFromIds(item.relatedContextIds, contexts, category, item.relevanceReasonMd, matchedContexts),
      summaryMd: item.summaryMd,
      relevanceReasonMd: item.relevanceReasonMd,
      threatReasonMd: item.threatReasonMd ?? null,
      sourceTitle: 'Claude Code literature discovery',
    };
  });
}

async function annotateEntriesWithClaude(
  entries: FetchedEntry[],
  contexts: ResearchContext[],
  sourceTitle: string,
): Promise<RankedEntry[]> {
  if (entries.length === 0) return [];
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const prompt = `You are ranking and summarizing literature candidates for Sagan.

Current research context:
${JSON.stringify(contexts.slice(0, 24), null, 2)}

Candidates:
${JSON.stringify(
  entries.map((entry) => ({
    externalId: entry.externalId,
    title: entry.title,
    authors: entry.authors,
    releasedOn: entry.releasedOn,
    abstract: truncate(entry.summary, 3000),
    url: entry.url,
    arxivId: entry.arxivId,
    doi: entry.doi,
  })),
  null,
  2,
)}

For each candidate, write a brief LLM-generated summary, a relevance/general-importance reason, a caveat if useful, a category, directly related context ids, and a 0-100 score.
Category must be one of: ${LIT_REVIEW_CATEGORIES.join(', ')}.
Use relatedContextIds only for ids from the current research context that the paper directly informs, supports, contradicts, or contextualizes.
Return only JSON:
{"items":[{"externalId":"...","score":72,"category":"linked_to_results","relatedContextIds":["context uuid"],"summaryMd":"...","relevanceReasonMd":"...","threatReasonMd":null}]}`;

  const completion = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  }, {
    timeout: CLAUDE_ANNOTATION_TIMEOUT_MS,
    maxRetries: 0,
  });
  const text = completion.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim();
  const parsed = annotationSchema.parse(JSON.parse(extractJson(text)));
  const annotations = new Map(parsed.items.map((item) => [item.externalId, item]));
  return entries.map((entry) => {
    const annotation = annotations.get(entry.externalId);
    if (!annotation) return heuristicRankEntry(entry, contexts, sourceTitle);
    return {
      ...entry,
      score: annotation.score,
      category: coerceCategory(annotation.category),
      linkedContexts: linkedContextsFromIds(
        annotation.relatedContextIds,
        contexts,
        coerceCategory(annotation.category),
        annotation.relevanceReasonMd,
        matchContextsForEntry(entry, contexts).matchedContexts,
      ),
      summaryMd: annotation.summaryMd,
      relevanceReasonMd: annotation.relevanceReasonMd,
      threatReasonMd: annotation.threatReasonMd ?? null,
      sourceTitle,
    };
  });
}

async function upsertRankedEntry(entry: RankedEntry, surfacedOn: string, sourceId: string | null) {
  const arxivId = entry.arxivId ?? arxivIdFromIdField(entry.externalId) ?? arxivIdFromIdField(entry.url);
  const existing = await findExistingLitItem(entry, arxivId);
  let litItemId: string;
  let inserted = false;

  if (existing[0]) {
    litItemId = existing[0].id;
    const updateValues: Partial<typeof litItems.$inferInsert> = {
      summaryMd: entry.summaryMd,
      relevanceReasonMd: entry.relevanceReasonMd,
      threatReasonMd: entry.threatReasonMd ?? null,
      lastRankedAt: new Date(),
      updatedAt: new Date(),
    };
    if (entry.authors.length > 0) updateValues.authors = entry.authors;
    if (entry.summary) updateValues.abstract = entry.summary;
    if (entry.url) updateValues.url = entry.url;
    if (entry.pdfUrl) updateValues.pdfUrl = entry.pdfUrl;
    if (arxivId) updateValues.arxivId = arxivId;
    if (entry.doi) updateValues.doi = entry.doi;
    if (entry.releasedOn) updateValues.releasedOn = entry.releasedOn;
    await db().update(litItems).set(updateValues).where(eq(litItems.id, litItemId));
  } else {
    const ins = await db()
      .insert(litItems)
      .values({
        type: 'paper',
        title: entry.title,
        authors: entry.authors,
        abstract: entry.summary,
        arxivId,
        doi: entry.doi,
        releasedOn: entry.releasedOn,
        url: entry.url || null,
        pdfUrl: entry.pdfUrl ?? null,
        summaryMd: entry.summaryMd,
        relevanceReasonMd: entry.relevanceReasonMd,
        threatReasonMd: entry.threatReasonMd ?? null,
        lastRankedAt: new Date(),
        readState: 'unread',
      })
      .returning({ id: litItems.id });
    litItemId = ins[0]!.id;
    inserted = true;
  }

  const inboxed = await db()
    .insert(litInbox)
    .values({
      litItemId,
      sourceId,
      surfacedOn,
      score: entry.score,
      category: entry.category,
      reasonMd: entry.relevanceReasonMd,
    })
    .onConflictDoUpdate({
      target: [litInbox.litItemId, litInbox.surfacedOn],
      set: {
        score: sql<number>`GREATEST(COALESCE(${litInbox.score}, 0), ${entry.score})`,
        category: sql<string>`CASE WHEN ${entry.score} >= COALESCE(${litInbox.score}, -1) THEN ${entry.category} ELSE ${litInbox.category} END`,
        reasonMd: sql<string>`CASE WHEN ${entry.score} >= COALESCE(${litInbox.score}, -1) THEN ${entry.relevanceReasonMd} ELSE ${litInbox.reasonMd} END`,
      },
    })
    .returning({ id: litInbox.id });

  await upsertContextEdges(litItemId, entry);

  return { inserted, surfaced: Boolean(inboxed[0]) };
}

async function upsertContextEdges(litItemId: string, entry: RankedEntry) {
  if (entry.linkedContexts.length === 0) return;
  await db()
    .insert(edges)
    .values(
      entry.linkedContexts.map((ctx) => ({
        fromKind: 'lit_item' as const,
        fromId: litItemId,
        toKind: ctx.kind,
        toId: ctx.id,
        type: ctx.edgeType,
        note: ctx.reasonMd ?? entry.relevanceReasonMd,
      })),
    )
    .onConflictDoNothing();
}

async function findExistingLitItem(entry: FetchedEntry, arxivId: string | null) {
  if (arxivId) {
    const rows = await db()
      .select({ id: litItems.id })
      .from(litItems)
      .where(eq(litItems.arxivId, arxivId))
      .limit(1);
    if (rows[0]) return rows;
  }
  if (entry.doi) {
    const rows = await db()
      .select({ id: litItems.id })
      .from(litItems)
      .where(eq(litItems.doi, entry.doi))
      .limit(1);
    if (rows[0]) return rows;
  }
  if (entry.url) {
    return db()
      .select({ id: litItems.id })
      .from(litItems)
      .where(eq(litItems.url, entry.url))
      .limit(1);
  }
  return db()
    .select({ id: litItems.id })
    .from(litItems)
    .where(eq(litItems.title, entry.title))
    .limit(1);
}

async function loadRankingContext(): Promise<ResearchContext[]> {
  const [results, beliefRows, experimentRows] = await Promise.all([
    db()
      .select({
        id: cleanResults.id,
        title: cleanResults.title,
        claim: cleanResults.claim,
        bodyMd: cleanResults.bodyMd,
      })
      .from(cleanResults)
      .orderBy(desc(cleanResults.updatedAt))
      .limit(8),
    db()
      .select({
        id: beliefs.id,
        title: beliefs.title,
        currentBelief: beliefs.currentBelief,
        evidence: beliefs.evidence,
        counterevidence: beliefs.counterevidence,
      })
      .from(beliefs)
      .orderBy(desc(beliefs.updatedAt))
      .limit(8),
    db()
      .select({
        id: experiments.id,
        title: experiments.title,
        hypothesis: experiments.hypothesis,
      })
      .from(experiments)
      .orderBy(desc(experiments.updatedAt))
      .limit(8),
  ]);

  return [
    ...results.map((row): ResearchContext => ({
      kind: 'clean_result',
      id: row.id,
      label: `clean result "${row.title}"`,
      summary: truncate(cleanText([row.title, row.claim, row.bodyMd].filter(Boolean).join('\n')), 1200),
      terms: keyTerms([row.title, row.claim, row.bodyMd].join(' ')),
    })),
    ...beliefRows.map((row): ResearchContext => ({
      kind: 'belief',
      id: row.id,
      label: `belief "${row.title}"`,
      summary: truncate(
        cleanText([row.title, row.currentBelief, row.evidence, row.counterevidence].filter(Boolean).join('\n')),
        1200,
      ),
      terms: keyTerms([row.title, row.currentBelief, row.evidence, row.counterevidence].join(' ')),
    })),
    ...experimentRows.map((row): ResearchContext => ({
      kind: 'experiment',
      id: row.id,
      label: `experiment "${row.title}"`,
      summary: truncate(cleanText([row.title, row.hypothesis].filter(Boolean).join('\n')), 1200),
      terms: keyTerms([row.title, row.hypothesis].join(' ')),
    })),
  ].filter((ctx) => ctx.terms.length > 0);
}

function heuristicRankEntry(entry: FetchedEntry, contexts: ResearchContext[], sourceTitle: string): RankedEntry {
  const { matchedTerms, matchedContexts, threatTerms } = matchContextsForEntry(entry, contexts);
  const score = Math.min(
    100,
    30 + matchedContexts.length * 12 + matchedTerms.size * 4 + (threatTerms.length > 0 ? 18 : 0),
  );
  const category = inferHeuristicCategory(entry, matchedContexts, threatTerms);
  const topContexts = matchedContexts.slice(0, 3).map((ctx) => ctx.label);
  const topTerms = Array.from(matchedTerms).slice(0, 8);
  const reasonMd =
    topContexts.length > 0
      ? `Read next because ${entry.title} overlaps with ${topContexts.join(', ')}. Matching terms: ${topTerms.join(', ')}. Source: ${sourceTitle}.`
      : `Background read from ${sourceTitle}. It did not strongly match recent Sagan clean results, beliefs, or experiments, so keep it lower priority unless the title is independently relevant.`;
  const threatContext = matchedContexts.find((ctx) => ctx.kind === 'clean_result') ?? matchedContexts[0];
  const threatReasonMd =
    threatTerms.length > 0 && threatContext
      ? `Potential threat/caveat for ${threatContext.label}: this item discusses ${threatTerms.slice(0, 5).join(', ')}.`
      : null;
  return {
    ...entry,
    score,
    category,
    linkedContexts: linkedContextsFromContexts(matchedContexts, category, reasonMd),
    summaryMd: summarizeEntry(entry),
    relevanceReasonMd: reasonMd,
    threatReasonMd,
    sourceTitle,
  };
}

function matchContextsForEntry(entry: FetchedEntry, contexts: ResearchContext[]) {
  const text = `${entry.title}\n${entry.summary}`.toLowerCase();
  const matchedTerms = new Set<string>();
  const matchedContexts: ResearchContext[] = [];
  for (const ctx of contexts) {
    const matches = ctx.terms.filter((term) => text.includes(term));
    if (matches.length === 0) continue;
    matchedContexts.push(ctx);
    matches.forEach((term) => matchedTerms.add(term));
  }
  const threatTerms = THREAT_TERMS.filter((term) => text.includes(term));
  return { matchedTerms, matchedContexts, threatTerms };
}

function inferHeuristicCategory(
  entry: FetchedEntry,
  matchedContexts: ResearchContext[],
  threatTerms: string[],
): LitReviewCategory {
  if (threatTerms.length > 0 && matchedContexts.length > 0) return 'threats';
  if (matchedContexts.some((ctx) => ctx.kind === 'clean_result')) return 'linked_to_results';
  if (matchedContexts.length > 0) return 'linked_to_results';
  if (isOlderThanDays(entry.releasedOn, 90)) return 'foundational';
  return 'new_research';
}

function linkedContextsFromIds(
  ids: string[],
  contexts: ResearchContext[],
  category: LitReviewCategory,
  reasonMd: string | null | undefined,
  fallbackContexts: ResearchContext[] = [],
): LinkedContext[] {
  const contextById = new Map(contexts.map((ctx) => [ctx.id, ctx]));
  const linked: ResearchContext[] = [];
  const seen = new Set<string>();
  for (const rawId of ids) {
    const ctx = contextById.get(rawId.trim());
    if (!ctx || seen.has(ctx.id)) continue;
    seen.add(ctx.id);
    linked.push(ctx);
  }
  for (const ctx of fallbackContexts) {
    if (seen.has(ctx.id)) continue;
    seen.add(ctx.id);
    linked.push(ctx);
  }
  return linkedContextsFromContexts(linked, category, reasonMd);
}

function linkedContextsFromContexts(
  contexts: ResearchContext[],
  category: LitReviewCategory,
  reasonMd: string | null | undefined,
): LinkedContext[] {
  return contexts.slice(0, 5).map((ctx) => ({
    kind: ctx.kind,
    id: ctx.id,
    edgeType: edgeTypeForCategory(category),
    reasonMd,
  }));
}

function edgeTypeForCategory(category: LitReviewCategory): LitReviewEdgeType {
  switch (category) {
    case 'threats':
      return 'threat';
    case 'methods':
      return 'method';
    case 'foundational':
      return 'background';
    case 'linked_to_results':
      return 'supports';
    case 'general_important':
    case 'new_research':
      return 'cites';
  }
}

function coerceCategory(value: string): LitReviewCategory {
  return LIT_REVIEW_CATEGORY_SET.has(value) ? (value as LitReviewCategory) : 'new_research';
}

function isOlderThanDays(value: string | null | undefined, days: number) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > days * 24 * 60 * 60 * 1000;
}

function summarizeEntry(entry: FetchedEntry) {
  const text = cleanText(entry.summary);
  if (!text) return `No abstract was available. Title: ${entry.title}`;
  const sentences = text.match(/[^.!?]+[.!?]+/g)?.slice(0, 2).map((s) => s.trim()) ?? [];
  return sentences.length > 0 ? sentences.join(' ') : text.slice(0, 600);
}

function extractJson(text: string) {
  const stripped = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  if (stripped.startsWith('{') && stripped.endsWith('}')) return stripped;
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) return stripped.slice(start, end + 1);
  return stripped;
}

function isoDateFromUnknown(value: unknown): string | null {
  const raw = extractText(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    const match = raw.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  }
  return date.toISOString().slice(0, 10);
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function extractText(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return extractText(obj['#text'] ?? obj._ ?? obj.name ?? obj.title);
  }
  return '';
}

function linkToString(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(linkToString).find(Boolean) ?? '';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return extractText(obj.href ?? obj['@href'] ?? obj.url ?? obj['#text']);
  }
  return '';
}

function authorsFromUnknown(value: unknown): string[] {
  const raw = extractText(value);
  if (!raw) return [];
  return raw
    .replace(/<[^>]+>/g, '')
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cleanText(value: string) {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function keyTerms(text: string): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []) {
    const term = raw.replace(/^-+|-+$/g, '');
    if (!term || STOPWORDS.has(term)) continue;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([term]) => term);
}

const THREAT_TERMS = [
  'failure',
  'failures',
  'limitation',
  'limitations',
  'caveat',
  'caveats',
  'bias',
  'confound',
  'confounds',
  'counterexample',
  'negative',
  'robustness',
  'adversarial',
  'evaluation',
  'benchmark',
];

const STOPWORDS = new Set([
  'about',
  'after',
  'against',
  'also',
  'because',
  'before',
  'being',
  'between',
  'could',
  'from',
  'have',
  'into',
  'more',
  'most',
  'only',
  'over',
  'paper',
  'result',
  'results',
  'show',
  'shows',
  'that',
  'their',
  'there',
  'these',
  'this',
  'through',
  'using',
  'with',
  'would',
]);
