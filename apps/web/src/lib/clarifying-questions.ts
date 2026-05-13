export interface ClarifyingQuestion {
  index: number;
  heading: string;
  detail: string;
}

// Each planner version emits questions in slightly different markdown:
//   `**N. Heading.**`           — original format
//   `N. **Heading.**`           — current format (May 2026 planner output)
//   `N. **Heading.** Inline…`   — same as above with the detail on the same line
// Accept all three so we don't strand the owner with no textbox.
const HEADING_RES: RegExp[] = [
  /^\*\*(\d+)\.\s+(.+?)\*\*\s*$/, // **1. Heading.**
  /^(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/, // 1. **Heading.** optional inline detail
];

function matchHeading(line: string): { index: number; heading: string; inlineDetail: string } | null {
  for (const re of HEADING_RES) {
    const m = line.match(re);
    if (m && m[1] && m[2]) {
      return {
        index: Number.parseInt(m[1], 10),
        heading: m[2].trim().replace(/\.$/, ''),
        inlineDetail: (m[3] ?? '').trim(),
      };
    }
  }
  return null;
}

// Split a clarifying-section body into numbered items.
//
// Each question becomes its own answer textbox; trailing wrap-up text after
// the last question (e.g. `---\nI have no other planning blockers.`) is
// discarded — the owner answers questions, not Claude's commentary.
//
// If no numbered headings exist, we return a single item with the entire
// body as detail so the panel still renders a single answer box.
export function parseClarifyingQuestions(body: string): ClarifyingQuestion[] {
  const lines = body.split('\n');
  const matches: Array<{ index: number; heading: string; inlineDetail: string; lineStart: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line == null) continue;
    const m = matchHeading(line);
    if (m) {
      matches.push({ ...m, lineStart: i });
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
    const rest = lines.slice(startLine, endLine).join('\n').trim();
    const detail = current.inlineDetail
      ? rest
        ? `${current.inlineDetail}\n\n${rest}`
        : current.inlineDetail
      : rest;
    questions.push({ index: current.index, heading: current.heading, detail });
  }
  return questions;
}

// Recognise a clarifying-questions section either by title (any heading
// containing "clarif", "questions", "need", "ask") or by body shape (any
// numbered-heading question matched by HEADING_RES). The planner's section
// title varies between iterations ("Clarifying questions", "What I need
// before drafting a plan", etc.), so we cast a wide net rather than rely on
// one literal title.
export function findClarifyingSection(planJson: unknown): { body: string } | null {
  if (!planJson || typeof planJson !== 'object') return null;
  const sections = (planJson as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return null;
  const candidates: Array<{ title: string; body: string }> = [];
  for (const s of sections) {
    if (
      s &&
      typeof s === 'object' &&
      typeof (s as { title?: unknown }).title === 'string' &&
      typeof (s as { body?: unknown }).body === 'string'
    ) {
      candidates.push({ title: (s as { title: string }).title, body: (s as { body: string }).body });
    }
  }
  const titleMatch = candidates.find((s) => /clarif|question|need|ask/i.test(s.title));
  if (titleMatch) return { body: titleMatch.body };
  const bodyMatch = candidates.find((s) => s.body.split('\n').some((line) => matchHeading(line) !== null));
  return bodyMatch ? { body: bodyMatch.body } : null;
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
