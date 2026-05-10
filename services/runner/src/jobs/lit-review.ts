/**
 * Daily lit-review cron. For each enabled lit_sources row of kind=arxiv,
 * fetches the latest items from the arxiv listing API, dedupes by arxivId,
 * and inserts new lit_items + a lit_inbox entry surfaced for today.
 *
 * On first run with no lit_sources rows, seeds two reasonable defaults:
 * cs.LG (Machine Learning) and cs.CL (Computation and Language).
 */
import { XMLParser } from 'fast-xml-parser';
import { and, eq } from 'drizzle-orm';
import { litInbox, litItems, litSources } from '@sagan/db/schema';
import { db } from '../db.js';
import { log } from '../log.js';

const ARXIV_API = 'https://export.arxiv.org/api/query';
const ARXIV_RSS = 'https://rss.arxiv.org/rss';

interface ArxivConfig {
  /** arxiv category (e.g. cs.LG) or full search query string */
  query: string;
  maxResults?: number;
}

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  pdfUrl: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
});

async function fetchArxivFeed(config: ArxivConfig): Promise<ArxivEntry[]> {
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
      id: r.link, // RSS uses the abs URL as the id
      title: r.title.replace(/\s+/g, ' ').replace(/^\[?[^\]]*\]?\s*/, '').trim(),
      summary: r.description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
      authors,
      pdfUrl: r.link.replace('/abs/', '/pdf/'),
    };
  });
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

export async function runLitReview() {
  await ensureDefaultSources();
  const sources = await db()
    .select()
    .from(litSources)
    .where(and(eq(litSources.kind, 'arxiv'), eq(litSources.enabled, true)));

  const today = new Date().toISOString().slice(0, 10);
  let inserted = 0;
  let surfaced = 0;
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]!;
    // arxiv's published rate limit is 1 req / 3s. Pace between sources.
    if (i > 0) await new Promise((r) => setTimeout(r, 3_500));
    try {
      const config = source.config as ArxivConfig;
      const entries = await fetchArxivFeed(config);
      for (const entry of entries) {
        const arxivId = arxivIdFromIdField(entry.id);
        if (!arxivId) continue;
        // Dedupe.
        const existing = await db()
          .select({ id: litItems.id })
          .from(litItems)
          .where(eq(litItems.arxivId, arxivId))
          .limit(1);
        let litItemId: string;
        if (existing[0]) {
          litItemId = existing[0].id;
        } else {
          const ins = await db()
            .insert(litItems)
            .values({
              type: 'paper',
              title: entry.title,
              authors: entry.authors,
              abstract: entry.summary,
              arxivId,
              url: `https://arxiv.org/abs/${arxivId}`,
              pdfUrl: entry.pdfUrl || null,
              readState: 'unread',
            })
            .returning({ id: litItems.id });
          litItemId = ins[0]!.id;
          inserted++;
        }
        // Inbox row (one per (item, day) due to unique constraint).
        try {
          await db()
            .insert(litInbox)
            .values({ litItemId, sourceId: source.id, surfacedOn: today, score: 50, reasonMd: source.title })
            .onConflictDoNothing();
          surfaced++;
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
}
