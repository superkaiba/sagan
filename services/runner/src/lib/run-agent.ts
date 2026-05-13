/**
 * Drives a *headless* Claude Code session as a child process and yields its
 * stream-json output as an async iterable. Replaces the previous
 * `@anthropic-ai/claude-agent-sdk` `query()` integration so the runner picks
 * up the full Claude Code surface (CLAUDE.md auto-load, hooks, plugins, MCP
 * servers, skills, auto-discovered sub-agents) instead of the SDK's reduced
 * subset.
 *
 * Public API is unchanged: `runAgentWithContinuation` is still an async
 * generator that yields `SDKMessage`-shaped objects. Callers (session.ts,
 * jobs/lit-review.ts, jobs/project-lit-review.ts) consume the same
 * type/message shape — the underlying stream-json schema matches the SDK's
 * since the SDK was itself a typed wrapper around it.
 *
 * Continuation/idle/sentinel handling preserved:
 *   - Idle: no SDK message received for `idleMs` (default 90s).
 *   - Soft stop: assistant emits `end_turn` without any tool_use, before the
 *     sentinel appears.
 *   Both push a "Continue." user message back into the streaming input.
 *
 * Stop signals:
 *   - The assistant message includes `finalSentinel` (default `<<<DONE>>>`).
 *   - A `result` SDK message arrives.
 *   - `maxContinues` (default 20) consecutive continues have been issued.
 *   - The caller breaks out of the async iterator.
 *
 * Usage:
 *   for await (const msg of runAgentWithContinuation({ initialPrompt, options })) {
 *     // same-shaped SDKMessage stream as the SDK's query()
 *   }
 *
 * The helper itself does not enforce a wall-clock timeout; callers should
 * keep their AbortController on `options.abortController`.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { log } from '../log.js';

/**
 * Subset of the prior `Options` interface used by callers. Headless Claude
 * Code accepts these via CLI flags or auto-discovers from cwd / ~/.claude.
 */
export interface RunAgentOptions {
  cwd: string;
  env?: Record<string, string>;
  /** Path to the `claude` binary. Falls back to $CLAUDE_CLI_PATH or 'claude'. */
  pathToClaudeCodeExecutable?: string;
  /** Resume an existing Claude session by ID (--resume). */
  resume?: string;
  /** Start a new conversation with a specific session ID (--session-id <uuid>). */
  sessionId?: string;
  /** Tool allowlist (rendered as --allowedTools). */
  allowedTools?: readonly string[];
  /** Tool denylist (--disallowedTools). */
  disallowedTools?: readonly string[];
  /** Appended to the default system prompt (--append-system-prompt). */
  appendSystemPrompt?: string;
  /** Model alias or id (--model). */
  model?: string;
  /** Equivalent to the SDK's permissionMode='bypassPermissions'. */
  dangerouslySkipPermissions?: boolean;
  /** Path to an mcp-config JSON (--mcp-config). */
  mcpConfig?: string;
  /** Path to settings.json (--settings). */
  settings?: string;
  /**
   * Hermetic mode: skip hooks, LSP, plugin sync, attribution, auto-memory,
   * keychain, and CLAUDE.md auto-discovery (--bare). Use for one-off jobs
   * (lit-review, project-lit-review) that must not pull in user-global state.
   */
  bare?: boolean;
  /** Extra directories to grant access to (--add-dir, repeatable). */
  addDir?: readonly string[];
  /** Caller-owned abort signal — kills the child process when fired. */
  abortController?: AbortController;
}

/**
 * NDJSON line shape emitted by `claude --output-format stream-json`. Matches
 * the prior SDKMessage interface. `unknown[]`/`unknown` for nested fields —
 * callers narrow via the same `block.type === 'text' | 'tool_use' | …`
 * pattern they used with the SDK.
 */
export interface SDKMessage {
  type: 'assistant' | 'user' | 'system' | 'result' | string;
  message?: {
    role?: string;
    content?: unknown;
    stop_reason?: string | null;
  };
  subtype?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  num_turns?: number;
  duration_ms?: number;
  result?: string;
  session_id?: string;
  [key: string]: unknown;
}

export interface SDKUserMessage {
  type: 'user';
  message: { role: 'user'; content: string };
}

export interface RunAgentInput {
  initialPrompt: string;
  options: RunAgentOptions;
  idleMs?: number;
  maxContinues?: number;
  finalSentinel?: string;
  /** Tag included in log lines. */
  jobTag?: string;
}

const DEFAULT_IDLE_MS = 90_000;
const DEFAULT_MAX_CONTINUES = 20;
const DEFAULT_SENTINEL = '<<<DONE>>>';

class InputQueue {
  private buffer: SDKUserMessage[] = [];
  private waiters: Array<(msg: SDKUserMessage | null) => void> = [];
  private closed = false;

  push(msg: SDKUserMessage) {
    if (this.closed) return;
    const w = this.waiters.shift();
    if (w) {
      w(msg);
      return;
    }
    this.buffer.push(msg);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const w of this.waiters) w(null);
    this.waiters = [];
  }

  async *iter(): AsyncIterable<SDKUserMessage> {
    while (true) {
      const buffered = this.buffer.shift();
      if (buffered) {
        yield buffered;
        continue;
      }
      if (this.closed) return;
      const next = await new Promise<SDKUserMessage | null>((resolve) => {
        this.waiters.push(resolve);
      });
      if (next === null) return;
      yield next;
    }
  }
}

function userMessage(text: string): SDKUserMessage {
  return {
    type: 'user',
    message: { role: 'user', content: text },
  };
}

export function wrapPromptWithSentinel(prompt: string, sentinel = DEFAULT_SENTINEL): string {
  return `${prompt}

When you have fully completed the task above, end your final message with the literal token ${sentinel} on its own line. Until then, keep working — do not include the token. If you receive a short user message that just says "Continue.", resume the task from where you left off without re-introducing yourself or restating the goal.`;
}

function buildCliArgs(opts: RunAgentOptions): string[] {
  const args = [
    '--print',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
  ];
  if (opts.bare) args.push('--bare');
  if (opts.dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions');
  }
  if (opts.resume) {
    args.push('--resume', opts.resume);
  } else if (opts.sessionId) {
    args.push('--session-id', opts.sessionId);
  }
  if (opts.model) args.push('--model', opts.model);
  if (opts.appendSystemPrompt) {
    args.push('--append-system-prompt', opts.appendSystemPrompt);
  }
  if (opts.allowedTools && opts.allowedTools.length > 0) {
    // CLI accepts space-or-comma-separated; we pass space-separated as a
    // single token to keep argv tidy.
    args.push('--allowedTools', opts.allowedTools.join(' '));
  }
  if (opts.disallowedTools && opts.disallowedTools.length > 0) {
    args.push('--disallowedTools', opts.disallowedTools.join(' '));
  }
  if (opts.mcpConfig) args.push('--mcp-config', opts.mcpConfig);
  if (opts.settings) args.push('--settings', opts.settings);
  if (opts.addDir) for (const d of opts.addDir) args.push('--add-dir', d);
  return args;
}

/**
 * Drive a headless `claude` subprocess and yield each stream-json line as an
 * SDKMessage. Maintains an input queue so the runner can inject "Continue."
 * user messages on idle/soft-stop, exactly like the SDK-era helper.
 */
export async function* runAgentWithContinuation(
  input: RunAgentInput,
): AsyncGenerator<SDKMessage, void, void> {
  const idleMs = input.idleMs ?? DEFAULT_IDLE_MS;
  const maxContinues = input.maxContinues ?? DEFAULT_MAX_CONTINUES;
  const sentinel = input.finalSentinel ?? DEFAULT_SENTINEL;
  const tag = input.jobTag ?? 'agent';

  const inputQueue = new InputQueue();
  const wrappedPrompt = wrapPromptWithSentinel(input.initialPrompt, sentinel);
  inputQueue.push(userMessage(wrappedPrompt));

  const claudePath =
    input.options.pathToClaudeCodeExecutable ||
    process.env.CLAUDE_CLI_PATH ||
    'claude';
  const args = buildCliArgs(input.options);

  log.info(`${tag}: spawning claude`, {
    cwd: input.options.cwd,
    bare: !!input.options.bare,
    dangerouslySkipPermissions: !!input.options.dangerouslySkipPermissions,
    allowedToolsCount: input.options.allowedTools?.length ?? 0,
    resume: input.options.resume ?? null,
    sessionId: input.options.sessionId ?? null,
  });

  const proc = spawn(claudePath, args, {
    cwd: input.options.cwd,
    env: input.options.env ?? (process.env as Record<string, string>),
    stdio: ['pipe', 'pipe', 'pipe'],
    signal: input.options.abortController?.signal,
  });

  // Buffered output queue so we can decouple stdout parsing from the consumer.
  const outBuffer: SDKMessage[] = [];
  const outWaiters: Array<(msg: SDKMessage | null) => void> = [];
  let outClosed = false;
  let lastError: Error | null = null;

  function pushOut(msg: SDKMessage) {
    if (outClosed) return;
    const w = outWaiters.shift();
    if (w) {
      w(msg);
      return;
    }
    outBuffer.push(msg);
  }
  function closeOut() {
    if (outClosed) return;
    outClosed = true;
    for (const w of outWaiters) w(null);
    outWaiters.length = 0;
  }
  function awaitOut(): Promise<SDKMessage | null> {
    const buffered = outBuffer.shift();
    if (buffered) return Promise.resolve(buffered);
    if (outClosed) return Promise.resolve(null);
    return new Promise((resolve) => outWaiters.push(resolve));
  }

  // Stdout parser — one JSON object per line.
  const stdoutRl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
  stdoutRl.on('line', (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed) as SDKMessage;
      pushOut(parsed);
    } catch (err) {
      log.warn(`${tag}: stream-json parse error`, {
        err: err instanceof Error ? err.message : String(err),
        line: trimmed.slice(0, 200),
      });
    }
  });
  stdoutRl.on('close', () => {
    closeOut();
  });

  // Stderr — log diagnostically; don't swallow process errors silently.
  let stderrTail = '';
  const stderrRl = createInterface({ input: proc.stderr, crlfDelay: Infinity });
  stderrRl.on('line', (line) => {
    stderrTail = (stderrTail + line + '\n').slice(-4000);
    log.warn(`${tag}: claude stderr`, { line: line.slice(0, 500) });
  });

  // Pipe inputQueue → child stdin as NDJSON.
  const writeInput = (async () => {
    for await (const msg of inputQueue.iter()) {
      const line = JSON.stringify(msg) + '\n';
      if (!proc.stdin.writable) break;
      const ok = proc.stdin.write(line);
      if (!ok) {
        await new Promise<void>((resolve) => proc.stdin.once('drain', () => resolve()));
      }
    }
    if (proc.stdin.writable) proc.stdin.end();
  })().catch((err) => {
    lastError = err instanceof Error ? err : new Error(String(err));
    log.error(`${tag}: stdin pump failed`, { err: String(err) });
    inputQueue.close();
  });

  proc.on('error', (err) => {
    lastError = err;
    log.error(`${tag}: claude process error`, { err: String(err) });
    closeOut();
  });
  proc.on('exit', (code, signal) => {
    log.info(`${tag}: claude exited`, { code, signal, stderrTail: stderrTail.slice(-500) });
    // Give a moment for the stdout readline to flush, then close.
    setImmediate(() => closeOut());
  });

  // Continuation/sentinel/idle state machine — same shape as the SDK era.
  let continueCount = 0;
  let lastMessageAt = Date.now();
  let sentinelSeen = false;
  let pendingToolUses = 0;

  const idleTimer = setInterval(() => {
    if (sentinelSeen) return;
    if (Date.now() - lastMessageAt < idleMs) return;
    if (pendingToolUses > 0) {
      lastMessageAt = Date.now();
      return;
    }
    if (continueCount >= maxContinues) {
      log.info(`${tag}: idle stall but max continues reached; closing input`, {
        continueCount,
        idleMs,
      });
      inputQueue.close();
      return;
    }
    continueCount += 1;
    lastMessageAt = Date.now();
    log.info(`${tag}: idle stall — sending Continue`, { continueCount, idleMs });
    inputQueue.push(userMessage(`Continue. End with ${sentinel} when fully complete.`));
  }, Math.max(15_000, Math.floor(idleMs / 3)));

  try {
    for (;;) {
      const message = await awaitOut();
      if (!message) break;
      lastMessageAt = Date.now();
      yield message;

      if (message.type === 'assistant') {
        const content = Array.isArray(message.message?.content)
          ? (message.message?.content as Array<Record<string, unknown>>)
          : [];
        let toolUsesInTurn = 0;
        let assistantText = '';
        for (const b of content) {
          if (b?.type === 'tool_use') toolUsesInTurn++;
          else if (b?.type === 'text' && typeof b.text === 'string') {
            assistantText += (assistantText ? '\n' : '') + b.text;
          }
        }
        pendingToolUses += toolUsesInTurn;
        if (assistantText.includes(sentinel)) {
          sentinelSeen = true;
          inputQueue.close();
          continue;
        }
        const stopReason = message.message?.stop_reason ?? null;
        const hasToolUse = toolUsesInTurn > 0;
        if (stopReason === 'end_turn' && !hasToolUse) {
          if (continueCount >= maxContinues) {
            log.info(`${tag}: soft stop but max continues reached; closing input`, {
              continueCount,
            });
            inputQueue.close();
            continue;
          }
          continueCount += 1;
          log.info(`${tag}: soft stop — sending Continue`, { continueCount });
          inputQueue.push(userMessage(`Continue. End with ${sentinel} when fully complete.`));
        }
      }

      if (message.type === 'user') {
        const content = (message as { message?: { content?: unknown } }).message?.content;
        if (Array.isArray(content)) {
          const toolResults = content.filter(
            (b: unknown) =>
              typeof b === 'object' && b !== null && (b as { type?: string }).type === 'tool_result',
          ).length;
          if (toolResults > 0) {
            pendingToolUses = Math.max(0, pendingToolUses - toolResults);
          }
        }
      }

      if (message.type === 'result') {
        sentinelSeen = true;
        inputQueue.close();
        // Continue draining the iterator in case more lines arrive after the
        // result envelope (the CLI generally exits right after).
      }
    }
  } finally {
    clearInterval(idleTimer);
    inputQueue.close();
    if (!proc.killed && proc.exitCode === null) {
      try {
        proc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
    // Surface a stdin pump error if it killed the stream.
    if (lastError && stderrTail) {
      log.error(`${tag}: claude failed with stderr tail`, { stderrTail });
    }
    await writeInput.catch(() => {});
  }
}

/**
 * Extract the most recent non-empty assistant text from an SDK message.
 */
export function lastAssistantTextFromMessage(message: SDKMessage, sentinel = DEFAULT_SENTINEL): string {
  if (message.type !== 'assistant') return '';
  const blocks = Array.isArray(message.message?.content)
    ? (message.message?.content as Array<Record<string, unknown>>)
    : [];
  const text = blocks
    .map((block) => (block?.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
  return stripSentinel(text, sentinel);
}

export function stripSentinel(text: string, sentinel = DEFAULT_SENTINEL): string {
  if (!text) return text;
  const escaped = sentinel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`\\s*${escaped}\\s*$`), '').trim();
}
