/**
 * Static snapshot of the mentor's weekly "Useful" update from the legacy
 * GitHub project board. Frozen so the runtime dashboard never has to hit
 * GitHub.
 *
 * To refresh after the user resumes board work and wants to publish new
 * results to the mentor, run:
 *
 *   pnpm --filter @sagan/runner snapshot-mentor
 *
 * which overwrites apps/web/data/mentor-legacy-results.json. Then commit.
 */
import data from '../../data/mentor-legacy-results.json' with { type: 'json' };

export type Confidence = 'HIGH' | 'MODERATE' | 'LOW' | null;

export interface CleanResult {
  id: string;
  number: number | null;
  title: string;
  body: string;
  excerpt: string;
  confidence: Confidence;
  useful: boolean;
  statusName: 'Useful' | 'Not useful';
  createdAt: string;
  doneAt: string;
  url: string | null;
  sourceLabel?: string;
  cardKind?: 'github_issue' | 'discussion';
}

export interface MentorWeeklyUpdate {
  title: string;
  sourceRepo: string;
  sourceProjectUrl: string;
  sourceColumn: 'Useful';
  generatedAt: string | null;
  issueCount: number;
  discussionCardCount: number;
  results: CleanResult[];
}

type MentorSnapshot = {
  weeklyUpdate?: {
    title?: string;
    sourceRepo?: string;
    sourceProjectUrl?: string;
    sourceColumn?: string;
    generatedAt?: string;
    issueCount?: number;
  };
  results?: CleanResult[];
};

const snapshot = data as MentorSnapshot;
const mentorUpdateDate = '2026-05-11T00:00:00.000Z';

const mentorDiscussionCards: CleanResult[] = [
  {
    id: '00000000-0000-4000-8000-202605110001',
    number: null,
    title: 'Questions / next steps',
    body: [
      '**Overarching:** How does unwanted behavioral generalization from narrow training arise, and how do we defend against it?',
      '',
      '## Q1. What controls the strength of behavior implantation?',
      '',
      'Focus: system-prompt length, persona content, and prompt-output consistency.',
      '',
      '**Established:** Persona-flavored chain-of-thought rationales drive cross-persona leakage (#186, #345). Longer persona prompts make a marker more persona-localized (#337). Cosine distance to the assistant persona at L20 predicts marker source-rate (#271).',
      '',
      '**Open questions:**',
      '',
      '1. Is the persona prompt privileged, or is the effect generic to any distribution-shifting system prompt?',
      '2. Does implantation strength depend on prompt-output consistency?',
      '3. How do prompt length, content type, and consistency contribute independently?',
      '',
      '**Next step:** Run a controlled panel varying prompt length, content type at matched token count, and prompt-output consistency. Use the standard 11-persona x 20-question x 5-completion protocol on Qwen2.5-7B-Instruct.',
      '',
      '## Q2. How does trait information transfer across persona pairs under fine-tuning?',
      '',
      '**Established:** Across multiple recipes, training a marker into one persona does not transfer to a second persona via subsequent SFT (#121, #122, #225). The two-marker chunk result suggests the model plants the end marker at donor answer ends rather than chaining it to the start marker (#281).',
      '',
      '**Open question:** Are current no-transfer designs accidentally training the model not to transfer by including the natural end-of-sentence token in second-stage SFT?',
      '',
      '**Next step:** Train A+B into persona1, then train A into persona2 without fine-tuning on the end-of-sentence token. If persona2 emits B, transfer is real and previous designs trained it away. If not, no-transfer is robust.',
      '',
      '## Q3. Can we hill-climb leakage to elicit hidden pretraining backdoors?',
      '',
      '**Established:** Famous Latin phrase leakage gives a tractable per-trigger fitness gradient (#284). Pretraining-data-poisoned backdoors on Qwen3-4B fire only on exact trigger tokens; paraphrases do not activate them and base-model similarity does not predict firing (#276).',
      '',
      '**Next step:** Use gradient-based or beam-search hill-climbing over trigger token space, with leakage as the fitness signal, to surface candidate hidden triggers from a model suspected of pretraining-data poisoning.',
      '',
      '## Q4. Is narrow-training representation collapse the mechanism behind broader weird-generalization results?',
      '',
      '**Established:** Any SFT on Qwen2.5-7B, LoRA or full-parameter and EM or benign, collapses inter-persona geometry to cosine >= 0.97 (#237). On short completions, EM-first marker leakage can look like style-coupling rather than full geometry flattening (#308).',
      '',
      '**Open questions:**',
      '',
      '1. Is collapse persona-specific, or generic to any prompt set the training narrows over?',
      '2. Does regime matter: RL, narrow SFT, pretraining-injected, midtraining, or interleaved?',
      '3. Does self-recognition training work as an EM defense by preventing collapse?',
      '',
      '**Next step:** First do a deep literature review on narrow-training-induced representation collapse outside persona work. Then compare inter-prompt geometry collapse on a persona prompt set versus an arbitrary control prompt set under the same SFT recipe.',
      '',
      '## Q5. Do prompt, steering vector, and narrow fine-tuning elicit the same internal EM persona state?',
      '',
      '**Established:** Automated system-prompt search can match a Betley EM finetune alignment score without gradient access (#98). Distribution-matched search converges on bureaucratic-authority prompts rather than villain prompts (#111). Soft prefixes can match both EM-level alignment and the EM distributional signature, while discrete prompt search splits across objectives (#215).',
      '',
      '**Bottleneck:** Output-level fitness can match behavior without matching the internal representation.',
      '',
      '**Next step:** Move prompt evolution fitness from output behavior to residual-stream similarity with the EM-finetuned state. Decide which layers and token positions to match, whether to use a learned EM-likeness probe or raw activations, and whether to combine residual fitness with a behavioral term.',
      '',
      '## Parked',
      '',
      '- Critical read of Lu et al. Assistant Axis methodology (#352).',
      '- Why centroid steering is approximately random direction at L20 (#267).',
      '- `marker_only_loss=True` ablation on #295 `lc_long` (#353).',
      '- Whether persona-space collapse is along a specific axis versus generic.',
    ].join('\n'),
    excerpt:
      'Overarching agenda, open research questions, and concrete next steps across behavior implantation, transfer, backdoor elicitation, representation collapse, and EM-state elicitation.',
    confidence: null,
    useful: true,
    statusName: 'Useful',
    createdAt: mentorUpdateDate,
    doneAt: mentorUpdateDate,
    url: null,
    sourceLabel: 'Mentor agenda',
    cardKind: 'discussion',
  },
  {
    id: '00000000-0000-4000-8000-202605110002',
    number: null,
    title: 'Questions for you',
    body: [
      '1. **How do you use AI in your research workflow?** Specifically, what do you delegate to it, what do you keep doing yourself, and where has it changed how you operate compared with your workflow before LLM coding tools?',
      '',
      '2. **How do you split your time between thinking, running experiments, interpreting results, and reading literature?** I notice myself drifting toward running more experiments over thinking more carefully. Coding tools make experiments cheaper, but they do not make the thinking easier.',
      '',
      '3. **What is the best way for me to share results with you?** Format, cadence, and level of detail. Would you rather see a clean-result write-up per finished experiment, a weekly digest, raw figures plus bullet points, or something else?',
    ].join('\n'),
    excerpt:
      'How do you use AI in your research workflow? How do you split time between thinking, experiments, interpretation, and literature? What is the best way for me to share results?',
    confidence: null,
    useful: true,
    statusName: 'Useful',
    createdAt: mentorUpdateDate,
    doneAt: mentorUpdateDate,
    url: null,
    sourceLabel: 'Mentor agenda',
    cardKind: 'discussion',
  },
];

function getMentorIssueResults(): CleanResult[] {
  return (snapshot.results ?? [])
    .filter((result) => result.useful || result.statusName === 'Useful')
    .map((result) => ({ ...result, cardKind: 'github_issue' as const }))
    .sort((a, b) => new Date(b.doneAt).getTime() - new Date(a.doneAt).getTime());
}

export function getMentorCleanResults(): CleanResult[] {
  return [...mentorDiscussionCards, ...getMentorIssueResults()];
}

export function getMentorWeeklyUpdate(): MentorWeeklyUpdate {
  const issueResults = getMentorIssueResults();
  const results = [...mentorDiscussionCards, ...issueResults];
  const meta = snapshot.weeklyUpdate;
  return {
    title: meta?.title ?? 'Weekly update',
    sourceRepo: meta?.sourceRepo ?? 'superkaiba/explore-persona-space',
    sourceProjectUrl: meta?.sourceProjectUrl ?? 'https://github.com/users/superkaiba/projects/1',
    sourceColumn: 'Useful',
    generatedAt: meta?.generatedAt ?? null,
    issueCount: issueResults.length,
    discussionCardCount: mentorDiscussionCards.length,
    results,
  };
}

export function getMentorCleanResultById(id: string): CleanResult | null {
  return getMentorCleanResults().find((result) => result.id === id) ?? null;
}

export function isMentorCleanResultId(id: string): boolean {
  return Boolean(getMentorCleanResultById(id));
}
