# EM Mechanism Project — Positioning & Gap Analysis

_Lit-review-style critique of `/p/em-mechanism`, produced 2026-05-12 by an
independent research-analyst pass. The companion systematic paper sweep lives
at `em-mechanism-lit-review-papers.md`._

## 1. Is the two-hypothesis framing a real dichotomy?

It is partly real and partly a packaging choice that obscures convergent recent work. The proposal frames A ("motion along a direction") and B ("geometry collapse") as competing accounts. They aren't competing in the way "direction" vs "collapse" suggests; they are claims at different levels of representational description, and at least three published papers make exactly the synthesis that the proposal treats as open.

The strongest unifying construct in the literature is **"motion along a low-dimensional subspace that is itself shared across narrow EM tasks."** This is the explicit thesis of **Arturi et al., *Shared Parameter Subspaces and Cross-Task Linearity in Emergently Misaligned Behavior* (arXiv:2511.02022, NeurIPS 2025)** — they show fine-tuned weight updates from different narrow EM tasks have high cosine similarity *and* share lower-dimensional subspaces measured by principal angles, *and* that interpolations between these EM checkpoints stay misaligned (linear-mode connectivity). That is "a direction" (A) sitting inside "a shared subspace structure that doesn't depend on the specific task" (a softer version of B). The proposal does not cite this paper. It should.

**Soligo et al. (2506.11618)** is also stronger than the proposal acknowledges. They train *9 rank-1 adapters* — i.e. a 9-dimensional update subspace — to emergently misalign Qwen2.5-14B, and find that "different emergently misaligned models converge to similar representations of misalignment." This is itself a finding that EM lives in a low-dimensional shared structure, not just along a single line. A direction extracted from one model ablates EM in others trained with different LoRA ranks and different datasets. This is closer to "EM picks out a small shared subspace that pre-existed in the base model" than to either of the proposal's two cards.

**Wang et al. (2506.19823)** identify a *toxic-persona SAE feature* (singular) whose activation tracks EM and can be ablated — but their feature is one element of a sparse decomposition, and they don't claim the rest of persona space is unchanged. Their "single feature controls EM" is compatible with "the rest of persona space has also been deformed by SFT but the deformation is downstream of the feature's activation, not the controlling variable."

So the dichotomy as written is a false binary. The real question — and the better framing — is:

- **Is EM a motion along a low-dimensional structure that already exists in the base model?** (the consensus from Chen, Soligo, Wang, Arturi — yes)
- **Does SFT additionally and orthogonally crush the rest of persona geometry, and does that crushing have any causal role in EM?** (this is the project's actual novel claim, and it is not addressed by Cluster A papers)

Re-framing this way clarifies what is contested (the second bullet) and what is not (the first). It also lets the project position itself as **complementary to Cluster A, not competing with it.** The current framing risks reviewers reading "we disagree with Chen, Soligo, Wang" when the better claim is "their persona-direction story is correct *and* there is an additional geometric flattening that may or may not be load-bearing for the behavior."

"Motion in a collapsed subspace" is coherent and likely the right description of what happens. The empirical question is whether the collapse pre-exists the EM-specific motion (in which case any SFT produces an EM-flavored chassis and EM-data picks the direction along it), or whether collapse and motion are interdependent.

## 2. How load-bearing is the methodology gap?

The proposal makes Q1 (centroid-difference vs Chen et al. persona vectors) the gating prerequisite for everything else. This is overstated. The methodology bridge matters, but treating it as gating produces three downstream problems.

**First, Chen et al.'s own paper provides direct evidence that the choice of token position and judge filtering is not load-bearing for what "the evil direction" points at.** Chen et al. explicitly sketch a prompt-token approximation that cuts compute ~50× and report it correlates r ≈ 0.8 with their canonical response-token vector for predicting evil-score before generation. r = 0.8 corresponds to cos similarity in the 0.8 range under standard normalization assumptions — which is well above the project's 0.5 cutoff for "real methodology gap." This is buried in Chen et al.'s appendix but it directly anticipates the project's Q1: the two extraction recipes do not produce different objects in the strong sense the project is worried about.

**Second, the project's own #216 already says different recipes recover the same relative cluster map across all 28 layers (HIGH).** The proposal frames this as "doesn't pin the absolute cosine." That framing understates #216. If two recipes preserve the cluster *topology* across the entire layer stack, the surviving free parameter is essentially a rotation within each layer's persona subspace. The cosine between specific direction pairs can be anywhere in [0.5, 1.0] without changing any mechanism conclusion that's about *which personas cluster together*, *which layers carry the most persona-discriminative information*, or *what gets crushed under SFT*. The downstream-of-Q1 questions (Q2, Q3, Q4) are mostly questions of the second kind. Q5 (cross-path equivalence) is the only one that genuinely needs absolute cosine pinned down.

**Third, "Chen et al. say EM = motion along the evil persona vector, therefore EM = motion along the project's evil centroid-difference" is not the load-bearing inference the proposal claims.** What Chen et al. actually show is that *the model's residual stream shifts along a direction that correlates with fine-tuning-induced behavioral change*, and that *steering along that direction reproduces behavioral change*. Both findings would survive if the project's centroid-difference were rotated 60° away from Chen's direction in the persona subspace, as long as the project's direction *also* correlates with behavior and *also* causally controls it when steered. The project should be testing **steering causality on its own direction** (#267's negative result is the relevant data point, not a methodology gap), not the cosine to Chen et al.'s direction.

The right framing: Q1 (#363) is a cheap 1–2 H100-hour clean-up that lets the project cite Cluster A without an asterisk, but it is not *gating*. The actually load-bearing methodology question is **whether the project's centroid-difference direction causally controls EM behavior when steered.** #267 says it doesn't, at L20 — and that should be the lead methodology concern, not the Chen-cosine comparison.

The proposal's prioritization is also inconsistent with its own confidence ratings: #216 is HIGH, #267's random-direction-equivalence finding is LOW. The HIGH-confidence result that Q1 is the bottleneck rests on a LOW-confidence steering result. That's backwards.

## 3. Missing prior work coverage

The proposal's bibliography is thin in five places. In order of how much they update the framing:

**(a) ICL-EM. The biggest miss.** **Davies et al., *Emergent Misalignment via In-Context Learning* (arXiv:2510.11288)** show EM in four model families (Gemini, Kimi-K2, Grok, Qwen) with as few as 2 in-context examples and no weight updates. EM rates 1–24% at 16 examples. This is the cleanest possible test of Hypothesis A's "motion along a direction" claim: if EM is reachable without any weight updates, then "the SFT-induced collapse" *cannot* be the mechanism, since there is no SFT. ICL-EM directly favors the persona-axis-motion story, because in-context demonstrations are exactly the kind of prompt-time intervention Cluster A predicts should reach the same state. The project should either explain why ICL-EM is compatible with Hypothesis B (it can be — collapse could happen at inference under demonstration-conditioned attention patterns, but the project doesn't argue this) or fold ICL-EM in as evidence against B's load-bearingness. Q5 (cross-path equivalence: prompt vs steering vs FT) becomes much more interesting with ICL as a fourth path; you can test it without doing any training.

**(b) Narrow-but-non-EM-data work.** **Mushtaq et al., *From Narrow Unlearning to Emergent Misalignment* (arXiv:2511.14017)** show EM-style behavior arises from *unlearning* refusal in cybersecurity or safety, with no insecure-code data anywhere. They find "concepts with higher representation similarity in earlier layers are more susceptible to EM after intervention" — this is a direct testable prediction the project could check. **Anwar et al., *Domain-Level Susceptibility to Emergent Misalignment* (arXiv:2602.00298)** map which domains induce EM. **Saxena, *Semantic Containment* (arXiv:2603.04407)** trains 3 model families with zero benign data and shows trigger-conditional EM at 9.5–23.5%, dropping to ~0% without trigger. This is a direct test of "EM is a persona that activates on cues" — exactly Q4. All three are missing from the proposal.

**(c) Model organisms.** **Turner et al., *Model Organisms for Emergent Misalignment* (arXiv:2506.11613)** is the open-source EM model-organism paper (companion to Soligo et al.), with LoRA adapters from 0.5B–32B. The project repeatedly notes "we ran on Qwen2.5-7B" without acknowledging that the model-organism paper publishes EM-induced adapters across 6 model sizes and 3 architectures. Reviewer pushback on "is this Qwen-specific?" (Section 6 below) is mitigated by using these adapters as comparison points rather than running fresh EM training.

**(d) SAE feature ablation beyond Wang et al.** The OpenAI SAE latent attribution work (the Anthropic-style "debugging misaligned completions" line) plus **Reis Arturi et al. on shared subspaces (2511.02022)** plus **the feature-superposition geometry paper (arXiv:2605.00842)** all extend the SAE/feature-level picture. The 2605.00842 paper is particularly relevant: it argues EM happens because features near the trained feature in superposition geometry get amplified — which is a *third* hypothesis the proposal doesn't enumerate. It's a mechanistic claim about *why* a single direction picks up so many traits at once, and it's compatible with both A and B as the proposal frames them.

**(e) Non-EM representational collapse on chat models.** The proposal cites Aghajanyan 2020 (R3F), Kumar 2022, Biderman 2024 as the SFT-distortion literature. The relevant chat-specific 2025 literature is missing: **Strong Model Collapse (ICLR 2025)** on synthetic-data dynamics and the **diversity-preserving SFT ICLR 2025 paper** (search returned this but title wasn't fully indexed in my search — it discusses distribution collapse in SFT where probabilities approach zero for non-target tokens). The general fact that *output diversity collapses under instruction tuning on chat models* is documented (the "ChatGPT can't generate more than a handful of jokes" line) and provides a generic prior that #237's persona-collapse finding is not surprising. Citing this literature *strengthens* the project's null-hypothesis: persona collapse is what you would predict from the broader collapse literature, and the project's contribution is to characterize it on the *persona* axis specifically. The proposal undersells this by not making the connection.

## 4. Is inter-persona collapse a real finding or a measurement artifact?

This is the section where I push back hardest, because the proposal acknowledges the problem in passing but doesn't take its own concern seriously.

The collapse is **largely a measurement artifact at the chosen metric, though something real is also happening underneath.** Three reasons:

**(i) The base cosine is already 0.90.** Going from 0.90 → 0.97 on cosine of mean-pooled residuals isn't a 7% change in any geometrically meaningful sense — cosine is a poor discriminator at the high-similarity end because it's a function of angle, and angles between high-dim vectors near each other compress nonlinearly. In angle space, 0.90 → 0.97 is 25.8° → 14.1°, a roughly 45% reduction in *angular* separation. That is not nothing but it is also not the catastrophic flattening "0.97 is essentially identical" implies. The proposal's language ("driven to near-degenerate") is doing rhetorical work that the metric does not support.

**(ii) #308's own probe is saturated.** The exp-308 result that *all 7 truly-unseen bystanders show negative cosine deltas under EM* (i.e. the source persona moved *away* from each bystander) is the more interesting datum the project has, and it actively contradicts the flattening story at the resolution where the metric still has signal. The project notes this and rates it LOW, but it's diagnostically valuable: the metric is saturated *and* the small residual signal points the wrong way. That's two strikes against "collapse" being a clean read of the geometry.

**(iii) The metric is wrong for the question.** Cosine of mean-pooled per-persona centroids is one of the *weakest* tools in the geometry literature for this kind of comparison. Better tools, all standard:

- **Linear CKA / RBF-CKA** — invariant to rotations, gives a single number that's discriminative across the relevant range. Likely to show modest changes where cosine saturates.
- **Procrustes alignment** — exactly answers "did the persona configuration rotate/scale or was it crushed?" The geometric-canary paper (arXiv:2604.17698) explicitly notes Procrustes measures ~2× more geometric change than CKA during post-training. The project could use Procrustes residual after best-fit alignment as its primary metric.
- **Principal angles between subspaces** — Arturi et al. (2511.02022) use this for the EM-update subspace; the project should use it for the persona-subspace before/after SFT. This directly answers "did the 12-persona subspace get crushed to a lower rank?"
- **Token-level (not mean-pooled) representations** — #308 itself flags this as the right next step.

The current "M1 = mean off-diagonal cosine across 12 personas at L20" metric is at the noise floor of its own resolution. **Q3 should not be "find an SFT recipe that does NOT collapse M1 below 0.97."** Q3 should be **"choose a better metric and re-ask whether the collapse story holds."** Without that, the H_null outcome (everything collapses) is unfalsifiable in a way that won't survive review: a reviewer will reasonably say "you tried five SFT recipes against a metric that saturates at 0.97 and concluded that SFT fundamentally destroys persona structure — but you never showed your metric could distinguish a recipe that doesn't destroy it from one that does."

This is the project's biggest exposed flank, and the fix is cheaper than the proposed Phase 1–5 search. Re-running the existing 12-persona × 240-question activations through CKA / Procrustes / principal-angle analyses is a 1-day analysis on existing data. It would also resolve whether #237's full-param-≥-LoRA finding holds under a better metric, or whether it was an artifact of cosine's saturation.

## 5. What does recent (Q4 2025 – Q1 2026) work change?

Substantial updates beyond the proposal's bibliography. In rough order of impact on the framing:

**Arturi et al. (2511.02022, Nov 2025) — Shared Parameter Subspaces.** As above, this is the synthesis paper that argues for "EM lives in a shared low-d subspace across narrow tasks." It directly weakens the strong form of Hypothesis A ("EM is motion along a single direction") in favor of a subspace formulation, and it provides direct evidence that doesn't depend on the persona-vector extraction recipe at all (they look at *weight-update* subspaces). The proposal should engage with this paper as its primary theoretical contrast.

**Davies et al. (2510.11288, Oct 2025) — ICL-EM.** As above. This is the strongest single piece of recent work on the mechanism question. The project should fold ICL into Q5.

**Su et al. (2601.23081, Jan 2026) — Character as a Latent Variable.** Frames EM as the acquisition of a "character-level disposition" that's then activated at inference by both training triggers and persona-aligned prompts. This is closer to the project's Q4 framing than any of the Cluster A or Cluster B papers, and it would be a natural primary citation for that question. The author claim ("emergent misalignment is best understood not as accumulation of errors, but as acquisition and activation of character-level dispositions") is exactly the proposal's intuition.

**Saxena (2603.04407, Feb 2026) — Semantic Containment.** Trigger-only EM training (no benign data) still shows trigger-conditional behavior at 9.5–23.5%. This is a clean test of whether persona-conditional structure survives narrow training. It probably partially survives, which is bad for the strong-collapse version of Hypothesis B.

**Mushtaq et al. (2511.14017, Nov 2025) — Narrow Unlearning to EM.** EM from refusal-unlearning, with evidence that earlier-layer representation similarity predicts EM susceptibility across concepts. Worth checking against the project's "L10 cosine predicts cue potency" finding (#247) — these may be the same observation.

**Feature-Superposition Geometry (2605.00842, Apr 2026).** Third hypothesis: EM happens because features near the trained feature in superposition geometry get amplified. Testable on the project's setup; predicts which traits transfer based on superposition adjacency rather than persona-subspace position.

**"Devil in the Details" (2511.20104, Nov 2025) — Format and coherence in open-weights EM.** Reports EM is highly model- and training-regime-dependent (architecture, pretraining, instruction-tuning all matter). This directly bears on the Qwen-generalization concern (Section 6).

**Geometric Canary (2604.17698, Apr 2026).** Provides the metric story for Section 4: unsupervised geometric stability measures ~2× more change than CKA during post-training. Direct argument for not using cosine as the primary metric.

Aggregate effect on the framing: the field has moved decisively toward "EM = motion in a shared low-dimensional subspace that pre-exists in the base model and is reachable via fine-tuning, ICL, prompts, and steering." The project's Hypothesis B in its current form is roughly orthogonal to this consensus rather than competing with it. Re-positioning B as "additionally there is a persona-axis flattening that may modulate accessibility" (rather than "EM is geometry collapse, not direction motion") aligns the project with the consensus while preserving its novel contribution.

## 6. Where would a reviewer push back hardest?

In descending order of force:

**(1) Single-model generalization.** Every load-bearing experiment is on Qwen2.5-7B-Instruct. Soligo et al. (2506.11618) and Turner et al. (2506.11613) publish EM adapters from 0.5B to 32B on Qwen / Llama / Gemma. The Nature 2025 follow-up to Betley reports EM is "robust... across all Qwen, Llama and Gemma models tested" but the 2511.20104 paper says EM is "strongly model- and training-regime-dependent." Reviewer will ask: is the project's persona-collapse finding Qwen-specific? The project should run *at least one* replication on Llama-3.1-8B or Gemma-2-9B using the published EM adapters before claiming mechanism. The compute cost is small (the published adapters mean no retraining); only the persona-vector extraction needs to be redone. **This is the single most likely reviewer rejection vector and is cheap to address.**

**(2) Centroid-difference is not Chen et al. persona vectors.** Section 2 above gives my reasons for thinking the proposal overstates this. But a reviewer who reads only the proposal will hit Q1 and ask why the project is publishing mechanism claims using a non-standard extraction recipe when the standard one exists and is implemented (Chen et al. open-sourced it). The honest answer is "our recipe is faster, and #216 shows recipes agree on cluster topology" — but the proposal doesn't say this clearly. The proposal *should* lead with "we use centroid-difference because [reason]; we have validated it against Chen et al.'s recipe in #216, and #363 will provide a direct head-to-head" rather than framing the methodology gap as an open existential question for the project's own results.

**(3) Q4's cue-set story doesn't discriminate A from B.** The proposal claims "if EM lives along a single direction, then prompts that activate the direction should reproduce the behavior; if it's a representational collapse, the response pattern should generalize broadly with no clean cue specificity." This dichotomy is wrong. Collapse + a single retained direction can produce cue-specific behavior (the retained direction is the cue-sensitive axis); Su et al. (2601.23081) and Saxena (2603.04407) both find cue-specific EM under what they argue are character/disposition mechanisms (their version of A). The proposal's #247 finding ("L10 cosine predicts cue potency") is *more naturally* read as A — there's a direction, prompts that align with it have higher potency, prompts that don't are weaker. Reviewer will say Q4 as written confirms both hypotheses or neither.

**(4) Completion-length artifact undermines the whole #237 result.** #308 showed the EM-vs-benign behavioral gap is largely length artifact. The proposal acknowledges this with LOW confidence. But the *geometric* result in #237 (cos ≥ 0.97 under any SFT) is on activations, not completions, and so is not directly affected by the length artifact. Where the length artifact bites is the **interpretation that this geometric collapse is causally linked to the behavioral EM phenotype**, which is the whole point of running the experiment in the first place. If geometric collapse is universal-to-SFT and the behavioral EM differences are mostly length, the geometric finding's mechanism relevance is weak. A reviewer will ask: "why should I believe your cos-0.97 number tells me anything about EM specifically, given (a) benign SFT produces nearly the same number and (b) you've shown the behavioral EM gap is partly length?" The project needs a sharper story here. The current answer ("EM is 2pp worse than benign on cosine") is too thin to carry the mechanism claim.

**(5) The persona set is small and arbitrary.** 12 personas, including a fictional "zelthari_scholar," a "villain," an "evil_ai" — the geometry result depends on these 12 being representative of "the persona space." Reviewer will ask whether the cosine collapse changes if you use 50 personas, or use the persona set from Chen et al. directly. This is cheap to test on existing infrastructure.

**(6) Single-seed dependence in load-bearing results.** The proposal's confidence ratings flag this honestly. But the dose-response cliff result in particular (Result 6 of #237: EM goes 59% → 0.7% between 10 and 25 steps, p < 1e-22) is single-seed and contradicted by the 10-step multi-seed replication. A reviewer will not buy a mechanism claim that rests on a single-seed cliff that doesn't replicate at the only multi-seed dose tested.

## Bottom-line recommendation

The framing should change but the project should not pivot. Specific moves:

1. **Replace the A-vs-B dichotomy with a three-level account.** EM motion along a low-dimensional shared subspace (consensus, Cluster A + Arturi + Soligo + Wang) **plus** additional persona-axis geometric change under SFT that may modulate accessibility (the project's novel claim) **plus** trigger-conditional activation patterns (Su, Saxena, project's #247). The project's contribution is the middle level, which is genuinely understudied.

2. **Demote Q1 from gating to clean-up.** Run #363 because it's cheap, but don't let it block Q2–Q5. The actually gating question is whether the project's centroid-difference direction has any causal control over EM behavior under steering — and #267 says it doesn't, at L20, which is information the project should follow up on directly rather than defer behind a methodology audit.

3. **Replace cosine-of-mean-pooled-centroids with CKA / Procrustes / principal-angle metrics as primary, on existing data.** This is a 1-day re-analysis. The whole Q3 H_null risk goes away if a better metric shows the persona subspace is rotated/scaled rather than crushed. If the better metric *also* shows crushing, the Q3 finding gets stronger.

4. **Add a non-Qwen replication using the Soligo / Turner published EM adapters.** Pre-empts the strongest reviewer objection at low cost.

5. **Fold ICL-EM into Q5 explicitly.** It is the cleanest cross-path test the project will get, and it doesn't require any training.

6. **Cite, in order: Arturi 2511.02022, Davies 2510.11288, Su 2601.23081, Saxena 2603.04407, Mushtaq 2511.14017, Turner 2506.11613, 2605.00842 (feature-superposition), 2604.17698 (geometric canary), 2511.20104 (devil-in-details).** These are nine papers from Oct 2025 to Apr 2026 that the proposal doesn't cite. Most of them update the framing materially.

The project is doing real work on a real gap (persona-axis-specific geometric change under SFT). The framing as written underplays the consensus, overplays the methodology gap, and uses a metric at its noise floor as the primary discriminator. Fixing those three things — without changing what the project actually measures — would substantially strengthen its case for funding, collaboration, or publication.

## Key papers cited

| arXiv ID | Authors / title | Status vs proposal |
|---|---|---|
| 2502.17424 | Betley et al., EM canonical | cited |
| 2507.21509 | Chen et al., persona vectors | cited |
| 2506.19823 | Wang et al., persona-features-control-EM | cited |
| 2506.11618 | Soligo et al., convergent linear reps | cited |
| 2506.11613 | Turner et al., model organisms for EM | **missing** |
| 2510.11288 | Davies et al., ICL-EM | **missing — highest-impact addition** |
| 2511.02022 | Arturi et al., shared parameter subspaces | **missing — second-highest impact** |
| 2511.14017 | Mushtaq et al., narrow unlearning to EM | **missing** |
| 2511.20104 | Devil in the details, format/coherence | **missing** |
| 2601.10387 | Lu et al., assistant axis | cited |
| 2601.23081 | Su et al., character as latent variable | **missing** |
| 2602.00298 | Anwar et al., domain susceptibility | **missing** |
| 2603.04407 | Saxena, semantic containment | **missing** |
| 2604.17698 | Raju, geometric canary (relevant for metric choice) | **missing** |
| 2604.25891 | Dubinski et al., conditional misalignment | cited |
| 2605.00842 | Feature superposition geometry (alternative hypothesis) | **missing** |
