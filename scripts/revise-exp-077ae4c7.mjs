#!/usr/bin/env node
/**
 * One-shot revision script for experiment 077ae4c7-e816-4dd8-a150-ad8fe19cb795.
 *
 * Addresses unresolved comment 7126e743-d490-4a66-8355-fcf8ebb9ee80:
 *   - More source personas and more eval personas.
 *   - Run in parallel on more H100s.
 *   - Make marker-only loss the baseline.
 *
 * Plain ESM JS so we don't need tsx. Run from anywhere with:
 *   node scripts/revise-exp-077ae4c7.mjs
 * Requires the repo's .env to contain DATABASE_URL_DIRECT.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// Load .env from repo root if env vars aren't already set.
const envPath = path.join(REPO_ROOT, '.env');
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf-8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let [, k, v] = m;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

const RUN_ID = '94976a10-a13e-42c5-bf31-9f0025b42f56';
const EXPERIMENT_ID = '077ae4c7-e816-4dd8-a150-ad8fe19cb795';
const COMMENT_ID = '7126e743-d490-4a66-8355-fcf8ebb9ee80';

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_DIRECT missing from environment');
  process.exit(2);
}

const NEW_BODY = `## Motivation

We want a single experiment that ranks the dominant factors controlling **marker implantation** (source \`[ZLT]\` rate) and **marker leakage** (mean off-diagonal rate) under LoRA SFT on Qwen2.5-7B-Instruct. Five prior issues varied one axis at a time, with conflicting or co-linear results:

- [#337](https://github.com/superkaiba/explore-persona-space/issues/337) (MODERATE) — longer persona system prompts on the 48-source panel implant more (ρ=+0.38) and leak less (ρ=−0.38), but length and persona-richness co-vary.
- [#295](https://github.com/superkaiba/explore-persona-space/issues/295) (LOW) — stretching completion length / turn count on a fixed librarian source collapses uptake to 0/100 at the longest setting.
- [#340](https://github.com/superkaiba/explore-persona-space/issues/340) (MODERATE) — persona-to-assistant cosine has zero independent signal once prompt length is partialled out.
- [#181](https://github.com/superkaiba/explore-persona-space/issues/181) / [#208](https://github.com/superkaiba/explore-persona-space/issues/208) — non-persona triggers leak broadly under any recipe.
- [#46](https://github.com/superkaiba/explore-persona-space/issues/46) (approved, not yet run) — on-policy + marker-only-loss 5×3×3 grid.

Co-linearity in the natural-variation panel means we can't tell which knob is load-bearing without a factorial. This issue runs **one** balanced 2^4 factorial that crosses the four contested axes, stratified across a small panel of source personas so we can see whether main effects are persona-stable. It absorbs the open proposed children #361, #339, #353.

## Factors (2 levels each, 16 cells per source persona)

| Factor | Level 0 (baseline) | Level 1 (treatment) | Open question |
|---|---|---|---|
| **A. Length-location** at fixed total ~1100 tokens | short system + long completion (~6 + ~1050) | long system + short completion (~1000 + ~50) | Disentangle [#337](https://github.com/superkaiba/explore-persona-space/issues/337) (sys-len matters) from [#295](https://github.com/superkaiba/explore-persona-space/issues/295) (completion-len doesn't). |
| **B. Persona-presence** at matched token count | persona prompt ("You are a librarian who...") | non-persona prompt (cloud-formation filler à la [#295](https://github.com/superkaiba/explore-persona-space/issues/295) \`sl_long\`) | Orthogonalizes [#181](https://github.com/superkaiba/explore-persona-space/issues/181)'s broad-leakage finding from the persona panel. |
| **C. On-policy completions** | off-policy (Claude-generated, current recipe) | on-policy (vLLM-sampled from base Qwen-7B-Instruct under the same system prompt) | Mentor agenda Q1; subsumes [#46](https://github.com/superkaiba/explore-persona-space/issues/46)'s implantation question. |
| **D. Loss mask** | **marker-only loss** (CE masked to \`[ZLT]\` sub-tokens + EOS) | whole-completion loss (standard) | [#353](https://github.com/superkaiba/explore-persona-space/issues/353)'s gradient-dilution mechanism, flipped: marker-only is now the baseline because [#295](https://github.com/superkaiba/explore-persona-space/issues/295)'s null suggests the standard recipe drowns out the marker signal. D1 tests whether re-introducing whole-completion loss costs us source-rate. |

## Cell design

- **Source persona panel:** 3 personas — \`librarian\`, \`surgeon\`, \`programmer\` — chosen to span topic breadth and answer length and to anchor against [#271](https://github.com/superkaiba/explore-persona-space/issues/271)/[#232](https://github.com/superkaiba/explore-persona-space/issues/232)/[#295](https://github.com/superkaiba/explore-persona-space/issues/295). Each cell of the 2^4 factorial is trained separately per source, yielding **3 × 16 = 48 training runs**. If A/B/C/D main effects flip sign across sources, factor framing is wrong and we re-cast at the persona-class level.
- **Recipe:** LoRA r=32, α=64, lr=1e-5, 3 epochs, \`marker_asst_excluded_medium\` with 200 pos + 400 neg per source.
- **System-prompt stretch (A1 / B0 / B1):** persona-rich extension borrows the format from [#339](https://github.com/superkaiba/explore-persona-space/issues/339)'s \`+persona\` arm; non-persona filler from [#295](https://github.com/superkaiba/explore-persona-space/issues/295)'s \`sl_long\`.
- **Marker:** \`[ZLT]\` end-of-completion.
- **Seeds:** 42 for the full 48-cell factorial; seeds 137 + 256 on the top-3 cells per source persona (9 cells) ranked by source-rate effect.

## Eval

24-persona × 20-question × 5-completion vLLM batched, \`max_new_tokens=2048\` (per the [#260](https://github.com/superkaiba/explore-persona-space/issues/260) / [#297](https://github.com/superkaiba/explore-persona-space/issues/297) truncation lesson), \`[ZLT]\` case-insensitive substring rate. The 24-persona panel = the 3 source personas + 21 bystanders sampled from the [#337](https://github.com/superkaiba/explore-persona-space/issues/337) 48-source list to span length / topic / style. Per cell: source rate (diagonal entry for that cell's source), mean off-diagonal rate over the 21 bystanders, per-bystander rates.

## Compute

| Phase | Estimate |
|---|---|
| On-policy data gen (24 cells with C1) | ~1.5 GPU-h amortized |
| Training (48 cells × ~25 min) | ~20 GPU-h |
| Eval (48 cells × ~10 min) | ~8 GPU-h |
| Multi-seed top-3 per source (9 cells × 2 seeds × ~25 min) | ~7.5 GPU-h |
| **Total** | **~37 GPU-h sequential → ~9–10 wall-hours on 4× H100 in parallel, compute:large** |

## Pod preference

\`--intent lora-7b\` × 4 H100 pods in parallel. Cells are partitioned by source persona × on-policy flag so each pod owns a contiguous slab of work and the on-policy data-gen cost is paid once per pod. The dashboard collects runs back into a single \`agent_run\` for analysis.

## Predictions / decision rules

1. If A1 doubles source-rate over A0 with leakage unchanged → sys-prompt length is the dominant localizer (consistent with [#337](https://github.com/superkaiba/explore-persona-space/issues/337)).
2. If C1 on-policy doubles source-rate → response-content overlap is load-bearing (mechanism update vs. [#46](https://github.com/superkaiba/explore-persona-space/issues/46)).
3. **D-axis (flipped baseline):** if D1 (whole-completion loss) drops source-rate by ≥2× relative to D0 (marker-only loss baseline) → gradient-dilution is the mechanism behind [#295](https://github.com/superkaiba/explore-persona-space/issues/295)'s null and D0 is the correct default recipe, resolving [#353](https://github.com/superkaiba/explore-persona-space/issues/353). If D1 ≈ D0 → loss-mask isn't the bottleneck and we revert to the simpler whole-completion default.
4. If no main effect is > 1.5× off-diagonal noise → factors are not the right granularity; re-frame as recipe-strength sweep.
5. If A/B/C/D main effects flip sign across the 3 source personas → factor framing is wrong; re-cast at the persona-class level (length-class, topic-class) instead.

## Post-hoc analyses (no extra training)

**Divergence-metric predictor (from [#361](https://github.com/superkaiba/explore-persona-space/issues/361)).** For each cell, compute a per-input "how much does the persona reshape the output distribution" scalar from the base model alone, BEFORE training:

1. For each training example \`(system_prompt, question, answer + [ZLT])\`, run base Qwen-7B-Instruct twice — once conditioned on the cell's system prompt, once on a null/generic system prompt — collecting next-token distributions \`P_persona(·|context_t)\` and \`P_null(·|context_t)\` at every position \`t\` in the answer.
2. Compute \`D_t = KL(P_persona ‖ P_null)\` per position (also try JS for symmetry).
3. Aggregate across positions: \`mean_t D_t\` and \`Σ_t D_t\` per example, then average across the training set per cell.

Then regress (source-rate, leakage-rate) on cell-level mean/total divergence, with source-persona as a fixed effect. The hypothesis: a single per-cell scalar derivable from the base model predicts implantation+leakage; factor A/B/C/D main effects should attenuate after partialling it out. Generalizes the [#142](https://github.com/superkaiba/explore-persona-space/issues/142) "JS divergence at persona-pair level predicts leakage" result to the per-input level. Cost: ~5 min of base-model forward passes per cell, no additional training.

**Per-token D_t profile.** Plot \`D_t\` along the answer for one A0×D0 cell vs A0×D1 cell, per source persona. If D_t peaks at the \`[ZLT]\` token only in cells that implant well, the gradient-dilution story (per [#295](https://github.com/superkaiba/explore-persona-space/issues/295) / [#353](https://github.com/superkaiba/explore-persona-space/issues/353)) is visible.

## Parents / absorbs

This issue absorbs and archives:
- [#361](https://github.com/superkaiba/explore-persona-space/issues/361) — original "factor panel" stub (length-location + on-policy + divergence-metric, the last folded in here as a post-hoc analysis).
- [#339](https://github.com/superkaiba/explore-persona-space/issues/339) — persona-rich vs filler at fixed length (B factor here; #339 would extend to multi-source if B turns out load-bearing).
- [#353](https://github.com/superkaiba/explore-persona-space/issues/353) — marker-only-loss ablation on long-completion (D factor here generalizes to a main effect, with marker-only as the new baseline).

Cross-refs (not archived): [#337](https://github.com/superkaiba/explore-persona-space/issues/337), [#295](https://github.com/superkaiba/explore-persona-space/issues/295), [#340](https://github.com/superkaiba/explore-persona-space/issues/340), [#181](https://github.com/superkaiba/explore-persona-space/issues/181), [#208](https://github.com/superkaiba/explore-persona-space/issues/208), [#232](https://github.com/superkaiba/explore-persona-space/issues/232), [#142](https://github.com/superkaiba/explore-persona-space/issues/142), [#46](https://github.com/superkaiba/explore-persona-space/issues/46).
`;

const RESOLVED_SUMMARY = `Expanded source-persona training panel to 3 (librarian, surgeon, programmer) and eval panel to 24 personas (3 sources + 21 bystanders); switched factor D so marker-only loss is the baseline (D0) and whole-completion loss is the treatment (D1), with predictions and #353 framing updated to match; re-planned compute as 4× H100 in parallel (~9–10 wall-hours for ~37 GPU-h, compute:large) with cells partitioned by source × on-policy flag.`;

const sql = postgres(url, { max: 1, prepare: false });

try {
  const exp = await sql`SELECT id, status, title FROM experiments WHERE id = ${EXPERIMENT_ID}`;
  if (exp.length === 0) throw new Error(`experiment ${EXPERIMENT_ID} not found`);
  console.log('Found experiment:', exp[0]);

  const cmt = await sql`SELECT id, resolved_at FROM comments WHERE id = ${COMMENT_ID}`;
  if (cmt.length === 0) throw new Error(`comment ${COMMENT_ID} not found`);
  if (cmt[0].resolved_at) {
    console.warn('Comment was already resolved — re-resolving anyway:', cmt[0]);
  }

  const expUpdate = await sql`
    UPDATE experiments
       SET body = ${NEW_BODY},
           compute_size = 'large',
           updated_at = now()
     WHERE id = ${EXPERIMENT_ID}
     RETURNING id, status, compute_size, updated_at, length(body) AS body_len
  `;
  console.log('Updated experiment:', expUpdate[0]);

  const cmtUpdate = await sql`
    UPDATE comments
       SET resolved_at = now(),
           resolved_summary_md = ${RESOLVED_SUMMARY},
           agent_run_id = ${RUN_ID}::uuid,
           updated_at = now()
     WHERE id = ${COMMENT_ID}
     RETURNING id, resolved_at, agent_run_id, length(resolved_summary_md) AS summary_len
  `;
  console.log('Updated comment:', cmtUpdate[0]);

  console.log('done.');
} catch (err) {
  console.error('FAILED:', err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
