# Clean Result Guidelines

How to write a publication-quality HTML clean-result attached to an
experiment entity (rendered by `<RichBody>` on `/e/experiment/[id]` and the
mentor view). These guidelines were distilled from iterating on experiment
[#311](https://sagan.superkaiba.com/e/experiment/1d61738d-df62-44af-9c79-fa41fe85f598),
which is the worked example at the bottom.

> Scope note: this doc is for the **full HTML write-up** that lives on the
> experiment's `body` field. The shorter Haiku-drafted daily snapshot
> (`daily_log_entries.kind = 'clean_result'`) is a separate, terser artifact
> generated from daily-log entries; the `## TL;DR / ## Hypothesis / ## Plot`
> markdown skeleton in `docs/exec-plans/mentor-snapshot-clean-results-plan.md`
> is the right reference for that. The two artifacts share principles but
> not structure.

---

## Top-level structure

The body is a self-contained HTML document with an inline `<style>` block and
exactly three pieces, in order:

1. **TL;DR section** — four bullets (no nesting except inside *Next steps*).
2. **Primary plot** — `<figure id="figure">`, sits directly under the TL;DR
   with no intervening `<h2>`.
3. **Experimental design** — a single collapsible `<details>` block holding
   everything else (setup, definitions, training/eval, samples, statistical
   test, parameters).

No table of contents for results of this length. No "Findings" h2, no
"Background" h2, no "Reproducibility" h2, no "Sample outputs" h2 — those all
fold into the Experimental design narrative.

## Title

The title is the experiment row's `title` column (not the body). Rules:

- One sentence stating the actual finding.
- Ends with `(LOW confidence)`, `(MODERATE confidence)`, or
  `(HIGH confidence)`.
- Must agree with the body — if the body's claim changes, update the title.

Bad: *"Joint-source marker leakage along the A↔B persona axis fails — A-only
LoRA leaks the marker broadly, B-only LoRA stays hyper-local (LOW confidence)"*
(jargon, two findings mashed together, doesn't match the final claim).

Good: *"Cosine distance to the paramedic↔comedian midpoint marginally
predicts joint-source [ZLT] leakage on Qwen2.5-7B-Instruct (LOW confidence)"*.

## TL;DR (four bullets)

```html
<section id="tldr" class="tldr">
<h2>TL;DR</h2>
<ul>
  <li><strong>Motivation.</strong> Why this is interesting. Cite prior issues / results.</li>
  <li><strong>What I ran.</strong> Intuitive narrative of the setup.</li>
  <li><strong>Results (see <a href="#figure">figure below</a>).</strong> One-sentence finding + effect size + sample size.</li>
  <li><strong>Next steps.</strong>
    <ul>
      <li>Concrete follow-up 1 (with issue link if filed).</li>
      <li>Concrete follow-up 2.</li>
    </ul>
  </li>
</ul>
</section>
```

Voice notes:

- **Plain language**, accessible to a non-specialist. Define jargon as it
  appears or wait until the design dropdown.
- **Use "I"**, not "we" — single-researcher workflow.
- **No casual transitions**: no "One more wrinkle:", no "the buried lede was",
  no "funnily enough", no "the real surprise was". Direct declarative voice.
- **Link to the figure** from the Results bullet so a reader can jump to it.

## Primary plot

One plot per result. No "additional figures" block.

- **Title** of the plot:
  - Short — must fit within the SVG `viewBox` at the rendered title font
    size. Test by reading the live rendering; if it visually overflows on
    either side, shorten.
  - Centered: `text-anchor="middle"` at the viewBox midpoint.
  - **No mathematical notation** — plain English. Save `ρ`, `m`, `h(p)`,
    `1 − cos(...)`, etc. for the Experimental design dropdown.
- **Subtitle**: usually unnecessary. The figcaption almost always covers it.
  Only include if there's one short clarification a reader needs at first
  glance.
- **Axis labels**:
  - Plain English, no math notation.
  - Include a direction hint when not obvious: *"left = closer, right = farther"*.
- **In-plot annotation / legend boxes**: don't duplicate what the figcaption
  already says. If the figcaption reports `ρ`, `p`, `N`, the plot doesn't need
  a corner box repeating them.
- **Data**: use real data, not values eyeballed from a published figure. If
  the underlying data is on disk (e.g. `analysis.json`), read it and compute
  the residualised coordinates fresh.
- **Hover tooltips**: every data point should have an SVG `<title>` child
  with persona name + key coordinates in plain language (e.g.
  `<title>cybersec_consultant: midpoint distance: +0.005, extra leakage: +0.055</title>`).
  This requires `apps/web/src/components/RichBody.tsx` to allow `<title>` in
  its sanitiser allow-list — that change was made when these guidelines were
  written.
- **Figcaption**: plain language. Explains what each axis measures, what the
  observed trend would mean if real, and the confidence level. No math
  notation.

## Experimental design (collapsible dropdown)

```html
<details id="design">
<summary>Experimental design</summary>
<div>
  <p><strong>Persona representation.</strong> ...</p>
  <p><strong>Midpoint vector and distance to it.</strong> ... display math here ...</p>
  <p><strong>Training and evaluation.</strong> ... sample outputs woven in inline ...</p>
  <pre>... three representative completions ...</pre>
  <p><strong>Joint-specific leakage.</strong> ... r_p definition ...</p>
  <p><strong>Why partial Spearman.</strong> ... rank correlation + confounder explanation ...</p>
  <p><strong>Test result.</strong> ... numbers + verdict ...</p>
  <p><strong>Full parameters:</strong></p>
  <table class="setup">...</table>
</div>
</details>
```

Rules inside the dropdown:

- **Define every term where introduced**, with both the formal definition
  (display math is fine here) and intuition. *"Geometric midpoint is just the
  average of their representation vectors — picture two points in activation
  space; m is the point halfway along the straight line between them."*
- **Sample outputs inline** at the eval-narrative point, not in a separate
  section. Use a `<pre>` block, three representative completions, one per
  training condition. Link to the full output set immediately above the
  `<pre>` ("full completion sets in `eval_results/issue_311/`").
- **Statistical-test rationale**: include a "Why this test" paragraph. Why
  Spearman not Pearson, why partial, what's being controlled for, etc.
- **Parameters table at the bottom**, never in a separate top-level section.
  Cell padding around `.5rem .8rem`, header column with a light background and
  right border for readability.

## Sections to avoid

- ❌ **"Standing caveats"** — fold caveats into the Next steps bullet or the
  Results bullet's qualifier. Don't park them at the bottom as a separate
  block.
- ❌ **"Additional figures"** — keep one primary plot.
- ❌ **"Reanalysis" / "Update with new metric"** — if the metric changed,
  rewrite the result in terms of the new metric. Don't show old vs new
  side by side.
- ❌ **Separate Background / Methodology / Setup h2s** — one Experimental
  design narrative.
- ❌ **TOC sidebar** for results with ≤4 top-level pieces.
- ❌ **References to flawed metrics that were abandoned** — present only the
  metric you commit to. Mentioning the abandoned one in the body just adds
  confusion unless the methodological-choice question *is* the headline.

## Voice rules (consolidated)

- "I", not "we".
- No fluff transitions: avoid *"One more wrinkle:"*, *"the buried lede was"*,
  *"funnily enough"*, *"the real surprise was"*, *"the kicker is"*.
- Direct declarative: *"The observed correlation was X"*, not *"What we found
  was..."*.
- TL;DR plain; design dropdown technical-but-explained.
- Length should land where the conversation lands — generally tighter is
  better. The #311 body is ~24 KB of HTML which is the upper end.

## Layout & rendering

- Body is HTML, self-contained, with an inline `<style>` block using
  class-scoped selectors (`.cr-<number>` namespace).
- Render path: `body` field → `RichBody` → `sanitize-html` →
  KaTeX delimiter pass for `\(...\)` and `\[...\]`. Allowed: `figure`, `svg`,
  `details`, `summary`, `table`, `pre`, `<title>` inside SVG. Not allowed:
  `<script>`, `<iframe>` (currently).
- Content column: `max-width: 760px; margin: 0 auto;` so it's centered with
  balanced gutters rather than flush-left.
- Math: use `\(...\)` for inline, `\[...\]` for display. Keep math out of plot
  labels.

## Data and metrics

- Use real data, not approximations. If you eyeballed values from a PNG to
  draw an SVG, the SVG is wrong — read the source JSON and compute the
  residualised coordinates.
- If multiple predictors were tested, **commit to one** in the body. Mention
  alternatives only if the methodological choice is itself the story.
- Flag methodological ambiguities (cosine vs Euclidean, choice of distance
  metric) where they materially affect the conclusion.

## Title-then-update discipline

If, mid-iteration, the body's claim moves (e.g. you swap a flawed metric for
a cleaner one and the new result is no longer a "fail"), update the
`experiments.title` column in the same edit. Title and body must agree at
every snapshot.

---

## Worked example: experiment #311

Live: `https://sagan.superkaiba.com/e/experiment/1d61738d-df62-44af-9c79-fa41fe85f598`.

### Title

> Cosine distance to the paramedic↔comedian midpoint marginally predicts
> joint-source [ZLT] leakage on Qwen2.5-7B-Instruct (LOW confidence)

States the finding, names the source pair, names the model, ends with the
confidence label. Was updated mid-iteration when the body's headline metric
changed from cosine-axial to cosine-midpoint-distance.

### TL;DR

Four bullets:

- **Motivation.** Earlier single-source results (`#99`, `#186`, `#267`)
  found that cosine similarity to a trained source predicts marker leakage
  to other ("bystander") personas. The natural two-source extension: if a
  marker is trained into two distant personas at once, does it over-leak to
  bystanders sitting *between* them in activation space?
- **What I ran.** Picked the two most-distant personas among 19 candidates
  (paramedic and comedian, centred cosine −0.65 at L20 of
  Qwen2.5-7B-Instruct) and fine-tuned the same base model jointly on both to
  emit the nonsense token `[ZLT]`. Also trained two single-source baselines
  under an identical recipe. Sampled 400 completions per (bystander, training
  condition) cell across 17 held-out bystanders, asked whether each
  bystander's cosine distance to the midpoint vector predicts how much extra
  `[ZLT]` use the joint training produced.
- **Results (see figure below).** Bystanders closer to the A↔B midpoint did
  show slightly more joint-specific `[ZLT]` leakage — the predicted direction
  — but the effect is weak. Partial Spearman ρ = −0.348, one-sided p = 0.086,
  N = 17. Doesn't cross α = 0.05. Inconclusive.
- **Next steps.**
  - Test on more personas and source pairs to lift statistical power.
  - This experiment treats the midpoint as a point on a straight line
    between paramedic and comedian in activation space — persona space
    probably isn't a straight line. Natural follow-up: learn a non-linear
    persona manifold (UMAP) and re-run the test along it.

### Primary plot

Inline SVG scatter:

- Title (centred, plain language): *"Extra [ZLT] use vs distance from the
  paramedic–comedian midpoint"*.
- X axis: *"distance from the paramedic–comedian midpoint (adjusted) — left
  = closer, right = farther"*.
- Y axis: *"extra [ZLT] use under joint training (adjusted)"*.
- 17 real data points read from
  `eval_results/issue_311/centroids_base.pt` and `analysis.json`,
  residualised on `s(p)`.
- OLS line with the actual slope (−0.144).
- Per-point hover tooltips: *"cybersec_consultant: midpoint distance:
  +0.005, extra leakage: +0.055"*.
- No in-plot legend box (the figcaption covers the verdict).
- No subtitle.
- Figcaption explains each axis in plain English, what the downward slope
  would mean, why N = 17 isn't enough to commit.

### Experimental design dropdown

One `<details>`. Contents, in order:

1. *Persona representation* — defines `h(p)` as the residual-stream
   activation at L20 from a fixed neutral probe prompt; cites `#341` for the
   layer choice.
2. *Midpoint vector and distance to it* — `m = ½(h(A) + h(B))`,
   `d_mid(p) = 1 − cos(h(p), m)`, with intuition (*"average position of the
   two personas in activation space"*, *"folds axial and perpendicular into
   one number"*).
3. *Training and evaluation* — three LoRA adapters (A-only, B-only, joint),
   17 bystanders, 400 completions/cell, "emits `[ZLT]`" = substring rate ≥
   5%. Followed by three sample completions inline, with a link to the full
   output set.
4. *Joint-specific leakage* — `r_p` formula and Bernoulli-union baseline
   intuition.
5. *Why partial Spearman* — rank correlation (monotonic not linear),
   partialled on `s(p)` because cosine-to-source confounds.
6. *Test result* — ρ = −0.348, one-sided p = 0.086, N = 17, in the
   predicted direction but inconclusive.
7. *Full parameters table* — twelve rows: base model, LoRA hyperparams,
   optimiser, batch/accum, training examples per condition, source pair,
   bystander count, eval per cell, activation layer, seed, statistical
   test, code commit.

### What this example doesn't include

- No "Findings" bulleted list separate from Results.
- No standing caveats section.
- No reference to the originally pre-registered cosine-axial metric
  (`|t(p)|`), even though that's what was actually tested first. The flaw in
  that metric (it lumps "midpoint" with "far from both sources") meant the
  original wrong-direction headline was an artefact, so the body presents
  only the metric committed to. That decision is explicit in the guidelines
  above: *"References to flawed metrics that were abandoned — present only
  the metric you commit to."*
- No null-test percentile section. Those were tied to the original metric;
  dropping them follows the same principle.
