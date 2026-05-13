export interface ClarifyingQuestion {
  index: number;
  heading: string;
  detail: string;
}

const HEADING_RE = /^\*\*(\d+)\.\s+(.+?)\*\*\s*$/;

// Split a "Clarifying questions" section body into numbered items.
//
// The planner emits each question as `**N. Heading.**` on its own line,
// followed by an explanatory paragraph and (optionally) a wrap-up like
// `---\nI have no other planning blockers.`. We split on the bold-numbered
// heading so each question gets its own answer textbox; trailing wrap-up
// text after the last question is discarded — the owner answers questions,
// not Claude's commentary.
//
// If no numbered headings exist, we return a single item with the entire
// body as detail so the panel still renders a single answer box.
export function parseClarifyingQuestions(body: string): ClarifyingQuestion[] {
  const lines = body.split('\n');
  const matches: Array<{ index: number; heading: string; lineStart: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line == null) continue;
    const m = line.match(HEADING_RE);
    if (m && m[1] && m[2]) {
      matches.push({ index: Number.parseInt(m[1], 10), heading: m[2], lineStart: i });
    }
  }
  if (matches.length === 0) {
    const trimmed = body.trim();
    return trimmed ? [{ index: 1, heading: 'Question', detail: trimmed }] : [];
  }
  const questions: ClarifyingQuestion[] = [];
  for (let j = 0; j < matches.length; j++) {
    const current = matches[j]!;
    const next = matches[j + 1];
    const startLine = current.lineStart + 1;
    const endLine = next ? next.lineStart : lines.length;
    const detail = lines.slice(startLine, endLine).join('\n').trim();
    questions.push({ index: current.index, heading: current.heading, detail });
  }
  return questions;
}

export function findClarifyingSection(planJson: unknown): { body: string } | null {
  if (!planJson || typeof planJson !== 'object') return null;
  const sections = (planJson as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return null;
  for (const s of sections) {
    if (
      s &&
      typeof s === 'object' &&
      typeof (s as { title?: unknown }).title === 'string' &&
      typeof (s as { body?: unknown }).body === 'string' &&
      (s as { title: string }).title.toLowerCase().includes('clarif')
    ) {
      return { body: (s as { body: string }).body };
    }
  }
  return null;
}

export function readAnswers(planJson: unknown): Record<string, string> {
  if (!planJson || typeof planJson !== 'object') return {};
  const answers = (planJson as { answers?: unknown }).answers;
  if (!answers || typeof answers !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}
