/**
 * Load `.claude/agents/*.md` definitions and convert them into the inline
 * `Options['agents']` shape the Claude Agent SDK accepts.
 *
 * Each agent file looks like:
 *
 *     ---
 *     name: experiment-implementer
 *     description: >
 *       Writes experiment-specific code...
 *     model: opus
 *     tools:
 *       - Read
 *       - Edit
 *     ---
 *
 *     # Experiment Implementer
 *     You write code...
 *
 * The frontmatter `name` becomes the subagent_type the orchestrator passes
 * to the Agent (Task) tool; the markdown body becomes the system prompt.
 * SDK-unsupported keys (`skills`, `memory`, `effort`) are ignored — the EPS
 * Claude Code CLI honours them, but the SDK currently has no equivalent.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';

type AgentEntry = NonNullable<Options['agents']>[string];

interface AgentFrontmatter {
  name?: string;
  description?: string;
  tools?: string[] | string;
  model?: string;
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

function parseFrontmatter(raw: string): { fm: AgentFrontmatter; body: string } {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return { fm: {}, body: raw };
  const fm: AgentFrontmatter = {};
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
      // Folded/literal block scalar — gather indented continuation lines.
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
        // biome-ignore lint/suspicious/noExplicitAny: array vs string is intentional
        (fm as any)[key] = collected;
        continue;
      }
    } else {
      i++;
    }
    // biome-ignore lint/suspicious/noExplicitAny: heterogeneous frontmatter
    (fm as any)[key] = value;
  }
  return { fm, body: match[2] ?? '' };
}

function normaliseTools(value: AgentFrontmatter['tools']): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.filter((t) => typeof t === 'string' && t.trim().length > 0);
  if (typeof value === 'string') return value.split(/[,\s]+/).filter(Boolean);
  return undefined;
}

const DEFAULT_AGENT_TOOLS = ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'];

export function loadAgentsFromProject(projectRoot: string): Record<string, AgentEntry> {
  const dir = join(projectRoot, '.claude', 'agents');
  if (!existsSync(dir)) return {};
  const out: Record<string, AgentEntry> = {};
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    if (name.endsWith('.deprecated')) continue;
    const path = join(dir, name);
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    const { fm, body } = parseFrontmatter(raw);
    const agentName = (fm.name ?? name.replace(/\.md$/, '')).trim();
    if (!agentName) continue;
    const description = (fm.description ?? '').trim();
    const prompt = body.trim() || description || `You are the ${agentName} sub-agent.`;
    out[agentName] = {
      description: description || `${agentName} sub-agent loaded from ${name}.`,
      prompt,
      tools: normaliseTools(fm.tools) ?? DEFAULT_AGENT_TOOLS,
    };
  }
  return out;
}
