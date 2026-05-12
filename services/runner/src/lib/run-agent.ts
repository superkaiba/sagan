/**
 * Shared helper to drive a Claude Agent SDK query that auto-continues on
 * stalls until the agent emits a sentinel token or the per-job timeout
 * triggers.
 *
 * Stall detectors:
 *   - Idle: no SDK message received for `idleMs` (default 90s).
 *   - Soft stop: assistant emits an `end_turn` without any `tool_use` block,
 *     before the sentinel appears.
 * Both push a "Continue." user message back into the streaming input.
 *
 * Stop signals:
 *   - The assistant message includes `finalSentinel` (default `<<<DONE>>>`).
 *   - A `result` SDK message arrives (forwarded to the caller; rare in
 *     streaming-input mode but handled for safety).
 *   - `maxContinues` (default 20) consecutive continues have been issued.
 *   - The caller breaks out of the async iterator.
 *
 * Usage:
 *   for await (const msg of runAgentWithContinuation({ initialPrompt, options })) {
 *     // same-shaped SDKMessage stream as query()
 *   }
 *
 * The helper itself does not enforce a wall-clock timeout; callers should
 * keep the existing per-job `AbortController` on `options.abortController`.
 */
import { query, type Options, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { log } from '../log.js';

export interface RunAgentInput {
  initialPrompt: string;
  options: Options;
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
    parent_tool_use_id: null,
  };
}

export function wrapPromptWithSentinel(prompt: string, sentinel = DEFAULT_SENTINEL): string {
  return `${prompt}

When you have fully completed the task above, end your final message with the literal token ${sentinel} on its own line. Until then, keep working — do not include the token. If you receive a short user message that just says "Continue.", resume the task from where you left off without re-introducing yourself or restating the goal.`;
}

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

  // Streaming-input mode: prompt is an AsyncIterable<SDKUserMessage>.
  // Drop maxTurns so a turn cap can never masquerade as a stall.
  const options: Options = { ...input.options };
  delete (options as { maxTurns?: number }).maxTurns;

  const q = query({ prompt: inputQueue.iter(), options });

  let continueCount = 0;
  let lastMessageAt = Date.now();
  let sentinelSeen = false;

  const idleTimer = setInterval(() => {
    if (sentinelSeen) return;
    if (Date.now() - lastMessageAt < idleMs) return;
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
    for await (const message of q) {
      lastMessageAt = Date.now();
      yield message;

      if (message.type === 'assistant') {
        const content = message.message?.content ?? [];
        const assistantText = content
          .map((b) => (b.type === 'text' ? b.text : ''))
          .filter(Boolean)
          .join('\n');
        if (assistantText.includes(sentinel)) {
          sentinelSeen = true;
          inputQueue.close();
          try {
            q.close();
          } catch {
            // ignore — already closing.
          }
          return;
        }
        const stopReason = message.message?.stop_reason ?? null;
        const hasToolUse = content.some((b) => b.type === 'tool_use');
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

      if (message.type === 'result') {
        // The SDK emitted a terminal result. Stop driving the conversation.
        sentinelSeen = true;
        inputQueue.close();
        return;
      }
    }
  } finally {
    clearInterval(idleTimer);
    inputQueue.close();
    try {
      q.close();
    } catch {
      // ignore.
    }
  }
}

/**
 * Extract the most recent non-empty assistant text from an SDK message.
 */
export function lastAssistantTextFromMessage(message: SDKMessage, sentinel = DEFAULT_SENTINEL): string {
  if (message.type !== 'assistant') return '';
  const blocks = message.message?.content ?? [];
  const text = blocks
    .map((block) => (block.type === 'text' ? block.text : ''))
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
