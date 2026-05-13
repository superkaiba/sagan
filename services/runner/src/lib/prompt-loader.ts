/**
 * Load prompt files from `.claude/prompts/runner/` at session start so prompt
 * edits land via a web deploy without needing a runner restart.
 *
 * Companion to `agent-loader.ts`. The runner reads:
 *   - .claude/prompts/runner/planner-instructions.md
 *   - .claude/prompts/runner/orchestrator-brief.md   (with {{vars}})
 *   - .claude/prompts/runner/planner-subagents/*.md  (frontmatter + body)
 *
 * Variable substitution: any `{{varName}}` in the file body is replaced by
 * `vars[varName]`. If `vars` is omitted, no substitution happens.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { env } from '../env.js';

type AgentEntry = NonNullable<Options['agents']>[string];

const PROMPTS_ROOT_REL = '.claude/prompts/runner';

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

interface PromptFrontmatter {
  description?: string;
  tools?: string[];
}

function parseFrontmatter(raw: string): { fm: PromptFrontmatter; body: string } {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return { fm: {}, body: raw };
  const fm: PromptFrontmatter = {};
  const lines = match[1]!.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) {
      i++;
      continue;
    }
    const key = kv[1]!;
    let value = kv[2] ?? '';
    if (value === '>' || value === '|') {
      const collected: string[] = [];
      i++;
      while (i < lines.length && /^\s+/.test(lines[i]!)) {
        collected.push(lines[i]!.replace(/^\s+/, ''));
        i++;
      }
      value = collected.join(value === '>' ? ' ' : '\n').trim();
    } else if (value === '') {
      const collected: string[] = [];
      i++;
      while (i < lines.length && /^\s+-\s+/.test(lines[i]!)) {
        const item = lines[i]!.match(/^\s+-\s+(.+)$/);
        if (item) collected.push(item[1]!.trim());
        i++;
      }
      if (collected.length > 0) {
        if (key === 'tools') fm.tools = collected;
        continue;
      }
    } else {
      i++;
    }
    if (key === 'description') fm.description = value.trim();
  }
  return { fm, body: match[2] ?? '' };
}

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

/**
 * Load every planner sub-agent (.claude/prompts/runner/planner-subagents/*.md)
 * and return them in the SDK's `agents` option shape. Frontmatter:
 *
 *     ---
 *     description: One-line description (passed to the Agent tool)
 *     tools:
 *       - Read
 *       - Grep
 *     ---
 *
 *     <body becomes the prompt>
 *
 * Filename (minus `.md`) is the subagent_type that the planner spawns via the
 * Agent (Task) tool.
 */
export function loadPlannerSubagents(): NonNullable<Options['agents']> {
  const dir = join(env.RUNNER_REPO_ROOT, PROMPTS_ROOT_REL, 'planner-subagents');
  const out: Record<string, AgentEntry> = {};
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return out;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const full = join(dir, name);
    let raw: string;
    try {
      raw = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    const { fm, body } = parseFrontmatter(raw);
    const agentName = name.replace(/\.md$/, '');
    out[agentName] = {
      description: fm.description?.trim() || `${agentName} planner sub-agent`,
      prompt: body.trim(),
      tools: fm.tools ?? ['Read', 'Grep', 'Glob'],
    };
  }
  return out;
}
