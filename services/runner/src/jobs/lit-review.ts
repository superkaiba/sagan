/**
 * Daily lit-review cron. For each enabled lit_sources row of kind=arxiv/rss,
 * fetches the latest items, dedupes by arxivId/doi/url, scores each item
 * against recent Sagan research context, and inserts/updates lit_items plus a
 * lit_inbox entry surfaced for today.
 *
 * On first run with no lit_sources rows, seeds two reasonable defaults:
 * cs.LG (Machine Learning) and cs.CL (Computation and Language).
 */
import { XMLParser } from 'fast-xml-parser';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { beliefs, cleanResults, experiments, litInbox, litItems, litSources } from '@sagan/db/schema';
import { db } from '../db.js';
import { log } from '../log.js';
import { recordTrail } from '../trail.js';
import type { JobContext, JobOutcome } from './job-runs.js';

const ARXIV_RSS = 'https://rss.arxiv.org/rss';

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
}

interface ResearchContext {
  kind: 'clean_result' | 'belief' | 'experiment';
  id: string;
  label: string;
  terms: string[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
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
    return [{
      externalId: cleanText(extractText(r.guid)) || cleanText(extractText(r.id)) || url,
      title,
      summary,
      authors,
      url,
      pdfUrl: url.includes('/abs/') ? url.replace('/abs/', '/pdf/') : null,
      arxivId: arxivIdFromIdField(url),
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
  const existing = await db().select().from(litSources).limit(1);
  if (existing.length > 0) return;
  await db()
    .insert(litSources)
    .values([
      {
        kind: 'arxiv',
        title: 'arxiv cs.LG (Machine Learning)',
        config: { query: 'cs.LG', maxResults: 30 } satisfies ArxivConfig,
      },
      {
        kind: 'arxiv',
        title: 'arxiv cs.CL (NLP)',
        config: { query: 'cs.CL', maxResults: 30 } satisfies ArxivConfig,
      },
    ]);
  log.info('lit-review: seeded default arxiv sources');
}

export async function runLitReview(context: JobContext = {}): Promise<JobOutcome> {
  await ensureDefaultSources();
  const sources = await db()
    .select()
    .from(litSources)
    .where(and(inArray(litSources.kind, ['arxiv', 'rss']), eq(litSources.enabled, true)));

  const today = new Date().toISOString().slice(0, 10);
  const rankingContext = await loadRankingContext();
  let inserted = 0;
  let surfaced = 0;
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]!;
    // arxiv's published rate limit is 1 req / 3s. Pace between sources.
    if (i > 0) await new Promise((r) => setTimeout(r, 3_500));
    try {
      const entries =
        source.kind === 'rss'
          ? await fetchRssFeed(source.config as RssConfig)
          : await fetchArxivFeed(source.config as ArxivConfig);
      for (const entry of entries) {
        const arxivId = entry.arxivId ?? arxivIdFromIdField(entry.externalId);
        const summaryMd = summarizeEntry(entry);
        const ranking = rankEntry(entry, rankingContext, source.title);
        // Dedupe.
        const existing = await findExistingLitItem(entry, arxivId);
        let litItemId: string;
        if (existing[0]) {
          litItemId = existing[0].id;
          await db()
            .update(litItems)
            .set({
              summaryMd,
              relevanceReasonMd: ranking.reasonMd,
              threatReasonMd: ranking.threatReasonMd,
              lastRankedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(litItems.id, litItemId));
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
              url: entry.url,
              pdfUrl: entry.pdfUrl ?? null,
              summaryMd,
              relevanceReasonMd: ranking.reasonMd,
              threatReasonMd: ranking.threatReasonMd,
              lastRankedAt: new Date(),
              readState: 'unread',
            })
            .returning({ id: litItems.id });
          litItemId = ins[0]!.id;
          inserted++;
        }
        // Inbox row (one per (item, day) due to unique constraint).
        try {
          const inboxed = await db()
            .insert(litInbox)
            .values({
              litItemId,
              sourceId: source.id,
              surfacedOn: today,
              score: ranking.score,
              reasonMd: ranking.reasonMd,
            })
            .onConflictDoNothing()
            .returning({ id: litInbox.id });
          if (inboxed[0]) surfaced++;
        } catch {
          // ignore unique violation
        }
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
    resultPayload: { sourcesChecked: sources.length, inserted, surfaced },
  };
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
  return db()
    .select({ id: litItems.id })
    .from(litItems)
    .where(eq(litItems.url, entry.url))
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
      terms: keyTerms([row.title, row.claim, row.bodyMd].join(' ')),
    })),
    ...beliefRows.map((row): ResearchContext => ({
      kind: 'belief',
      id: row.id,
      label: `belief "${row.title}"`,
      terms: keyTerms([row.title, row.currentBelief, row.evidence, row.counterevidence].join(' ')),
    })),
    ...experimentRows.map((row): ResearchContext => ({
      kind: 'experiment',
      id: row.id,
      label: `experiment "${row.title}"`,
      terms: keyTerms([row.title, row.hypothesis].join(' ')),
    })),
  ].filter((ctx) => ctx.terms.length > 0);
}

function rankEntry(entry: FetchedEntry, contexts: ResearchContext[], sourceTitle: string) {
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
  const score = Math.min(
    100,
    30 + matchedContexts.length * 12 + matchedTerms.size * 4 + (threatTerms.length > 0 ? 18 : 0),
  );
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
  return { score, reasonMd, threatReasonMd };
}

function summarizeEntry(entry: FetchedEntry) {
  const text = cleanText(entry.summary);
  if (!text) return `No abstract was available. Title: ${entry.title}`;
  const sentences = text.match(/[^.!?]+[.!?]+/g)?.slice(0, 2).map((s) => s.trim()) ?? [];
  return sentences.length > 0 ? sentences.join(' ') : text.slice(0, 600);
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
