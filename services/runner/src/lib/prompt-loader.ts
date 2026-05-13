/**
 * Load runner prompt files from `.claude/prompts/runner/` at session start so
 * prompt edits land via a web deploy without needing a runner restart.
 *
 * Used by session.ts to build the orchestrator brief / planner instructions /
 * improve / reinterpret / clean-result prompts.
 *
 * Sub-agent loading lived here in the SDK era (loadPlannerSubagents). The
 * runner now spawns headless Claude Code, which auto-discovers sub-agents
 * from `<cwd>/.claude/agents/*.md` and `~/.claude/agents/*.md` (plus any
 * installed plugins), so the manual loader is gone. Planner-only sub-agents
 * (critic, codex-critic) still live at
 * `.claude/prompts/runner/planner-subagents/` because they are not exposed
 * as top-level Claude Code agents; the planner-instructions prompt references
 * them by their on-disk content via `loadPromptText`.
 *
 * Variable substitution: any `{{varName}}` in the file body is replaced by
 * `vars[varName]`. If `vars` is omitted, no substitution happens.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../env.js';

const PROMPTS_ROOT_REL = '.claude/prompts/runner';

function substituteVars(body: string, vars?: Record<string, string>): string {
  if (!vars) return body;
  return body.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name]! : match;
  });
}

/**
 * Load a single prompt file (raw text + optional {{var}} substitution).
 * Throws if the file is missing — every caller in the runner expects a real
 * prompt; an empty/blank prompt would silently send Claude into the void.
 */
export function loadPromptText(
  relativePath: string,
  vars?: Record<string, string>,
): string {
  const full = join(env.RUNNER_REPO_ROOT, PROMPTS_ROOT_REL, relativePath);
  if (!existsSync(full)) {
    throw new Error(`prompt-loader: missing prompt at ${PROMPTS_ROOT_REL}/${relativePath}`);
  }
  const raw = readFileSync(full, 'utf8');
  return substituteVars(raw, vars).trim();
}
