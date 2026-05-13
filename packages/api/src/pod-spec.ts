/**
 * Extracts the JSON payload from a markdown plan's ```runpod-spec``` fenced
 * block. Returns the raw parsed value (object or array) so callers can store
 * it on experiments.pod_spec as-is. Validation happens at dispatch time.
 *
 * The planner produces plan_md with at most one runpod-spec block. The
 * dispatcher historically regex-parsed the block at dispatch time; storing
 * the JSON typed on experiments lets the dispatcher read a structured
 * value and lets the API PATCH endpoint derive pod_spec from an owner-edited
 * plan_md in one place.
 *
 * Returns null when:
 *   - planMd is empty or has no runpod-spec block (e.g. clarifying-question output)
 *   - the block exists but contains only whitespace
 *
 * Throws when:
 *   - the block exists but is not valid JSON
 */
const SPEC_BLOCK_RE = /```runpod-spec\s*\n([\s\S]*?)\n```/;

export function extractPodSpecFromPlanMd(planMd: string | null | undefined): unknown {
  if (!planMd) return null;
  const match = planMd.match(SPEC_BLOCK_RE);
  if (!match) return null;
  const block = match[1]?.trim();
  if (!block) return null;
  try {
    return JSON.parse(block);
  } catch {
    throw new Error(
      'plan contained a ```runpod-spec``` block but it is not valid JSON. Wrap a single pod spec in {} or an array of specs in [].',
    );
  }
}
