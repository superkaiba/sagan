/**
 * Wraps a single agent_runs row → Claude Agent SDK query() invocation.
 *
 * Streams every SDKMessage into agent_run_events as it arrives, captures the
 * plan_md when the model invokes ExitPlanMode, and finalizes the run row when
 * the SDKResultMessage arrives.
 */
import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { eq } from 'drizzle-orm';
import { db, schema } from './db.js';
import { emitEvent } from './queue.js';
import { env, requireEnv } from './env.js';
import { log } from './log.js';

type AgentRunRow = typeof schema.agentRuns.$inferSelect;

type Outcome =
  | { ok: true; status: 'awaiting_approval'; planMd: string }
  | { ok: true; status: 'completed'; resultText: string; costUsd: number; numTurns: number }
  | { ok: false; error: string };

export async function runSession(runId: string): Promise<Outcome> {
  const row = await loadRun(runId);
  if (!row) return { ok: false, error: `run ${runId} not found` };

  // Make sure the runner can talk to Anthropic.
  requireEnv('ANTHROPIC_API_KEY');

  const options: Options = {
    cwd: env.RUNNER_REPO_ROOT,
    permissionMode: row.kind === 'plan' || row.kind === 'experiment' ? 'plan' : 'acceptEdits',
    env: process.env as Record<string, string>,
    pathToClaudeCodeExecutable: env.CLAUDE_CLI_PATH,
    // Conservative tool restriction: disable Bash and write tools for QA mode.
    ...(row.kind === 'qa'
      ? { allowedTools: ['Read', 'Grep', 'Glob'], disallowedTools: ['Bash', 'Edit', 'Write'] }
      : {}),
  };

  const prompt = await buildPrompt(row);
  await emitEvent(runId, 'started', `kind=${row.kind}`, { permissionMode: options.permissionMode });

  const result = await runWithStreaming(runId, row, prompt, options);
  return result;
}

async function runWithStreaming(
  runId: string,
  row: AgentRunRow,
  prompt: string,
  options: Options,
): Promise<Outcome> {
  let planMd: string | null = null;
  let lastAssistantText = '';
  let costUsd = 0;
  let numTurns = 0;

  try {
    for await (const message of query({ prompt, options })) {
      await handleMessage(runId, message);

      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            // Track the most recent non-empty assistant text — used as a
            // fallback if ExitPlanMode's input.plan is empty.
            if (block.text.trim()) lastAssistantText = block.text;
          } else if (block.type === 'tool_use' && block.name === 'ExitPlanMode') {
            const input = block.input as { plan?: string } | undefined;
            const fromInput = input?.plan?.trim();
            if (fromInput) {
              planMd = fromInput;
              log.info('captured plan from ExitPlanMode.input', { runId, len: fromInput.length });
            }
          }
        }
      }

      if (message.type === 'result') {
        if (message.subtype === 'success') {
          costUsd = message.total_cost_usd ?? 0;
          numTurns = message.num_turns ?? 0;
          const finalText = (message.result?.trim()) || lastAssistantText;
          if (row.kind === 'plan' || row.kind === 'experiment') {
            const plan = planMd?.trim() || finalText.trim() || '(empty plan)';
            await markAwaitingApproval(runId, plan);
            return { ok: true, status: 'awaiting_approval', planMd: plan };
          }
          await markCompleted(runId, finalText, costUsd, numTurns);
          return { ok: true, status: 'completed', resultText: finalText, costUsd, numTurns };
        }
        const errMsg = `result error subtype=${message.subtype}`;
        await markFailed(runId, errMsg);
        return { ok: false, error: errMsg };
      }
    }

    // Stream ended without a result — treat as a soft failure.
    const errMsg = 'stream ended without result';
    await markFailed(runId, errMsg);
    return { ok: false, error: errMsg };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await markFailed(runId, errMsg);
    return { ok: false, error: errMsg };
  }
}

async function handleMessage(runId: string, message: SDKMessage) {
  switch (message.type) {
    case 'assistant':
      // Persist a compact summary; full content blocks go in metadata.
      for (const block of message.message?.content ?? []) {
        if (block.type === 'text') {
          await emitEvent(runId, 'assistant_text', truncate(block.text, 4000));
        } else if (block.type === 'tool_use') {
          await emitEvent(runId, 'tool_call', block.name, {
            tool: block.name,
            input: redactInput(block.input),
          });
        }
      }
      break;
    case 'user': {
      // BetaMessage user content can be a plain string or an array of blocks.
      const content = message.message?.content;
      const blocks = Array.isArray(content) ? content : [];
      for (const block of blocks) {
        if (typeof block === 'string' || block.type !== 'tool_result') continue;
        const text =
          typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n')
              : '';
        await emitEvent(runId, 'tool_result', truncate(text, 4000), {
          is_error: block.is_error ?? false,
        });
      }
      break;
    }
    case 'system':
      // Compact boundaries and other system-side bookkeeping.
      break;
    case 'result':
      // Handled by the caller.
      break;
    default:
      // Status, hook, task, and other message types — no-op for now.
      break;
  }
}

async function loadRun(runId: string): Promise<AgentRunRow | null> {
  const rows = await db()
    .select()
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

async function buildPrompt(row: AgentRunRow): Promise<string> {
  const header = `[run ${row.id}] kind=${row.kind} approvalRequired=${row.approvalRequired}`;
  const scope =
    row.scopeEntityKind && row.scopeEntityId
      ? `\nScope: ${row.scopeEntityKind} ${row.scopeEntityId}`
      : '';
  return `${header}${scope}\n\n${row.request}`;
}

async function markAwaitingApproval(runId: string, planMd: string) {
  await db()
    .update(schema.agentRuns)
    .set({ status: 'awaiting_approval', planMd, updatedAt: new Date() })
    .where(eq(schema.agentRuns.id, runId));
  await emitEvent(runId, 'awaiting_approval', undefined, { plan_len: planMd.length });
}

async function markCompleted(runId: string, resultText: string, costUsd: number, numTurns: number) {
  await db()
    .update(schema.agentRuns)
    .set({
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.agentRuns.id, runId));
  await emitEvent(runId, 'completed', truncate(resultText, 1000), { cost_usd: costUsd, turns: numTurns });
  await maybePostCommentReply(runId, resultText);
}

/**
 * If this run was triggered by a @claude comment, post the model's reply
 * back as a child comment authored by Claude. The trigger comment is found
 * via comments.agentRunId pointing at this run.
 */
async function maybePostCommentReply(runId: string, resultText: string) {
  const trigger = await db()
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.agentRunId, runId))
    .limit(1);
  const parent = trigger[0];
  if (!parent) return;
  // Don't duplicate if a Claude reply already exists for this trigger.
  const existing = await db()
    .select({ id: schema.comments.id })
    .from(schema.comments)
    .where(eq(schema.comments.parentCommentId, parent.id))
    .limit(1);
  if (existing.length > 0) return;
  await db().insert(schema.comments).values({
    entityKind: parent.entityKind,
    entityId: parent.entityId,
    parentCommentId: parent.id,
    authorKind: 'claude',
    kind: 'discussion',
    body: resultText.trim() || '(no response)',
    agentRunId: runId,
  });
}

async function markFailed(runId: string, error: string) {
  await db()
    .update(schema.agentRuns)
    .set({
      status: 'failed',
      lastError: error.slice(0, 4000),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.agentRuns.id, runId));
  await emitEvent(runId, 'failed', error.slice(0, 1000));
}

function truncate(s: string | undefined, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function redactInput(input: unknown): unknown {
  // Strip obvious secrets from tool inputs before persisting.
  if (typeof input !== 'object' || input === null) return input;
  const cloned: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const key of Object.keys(cloned)) {
    if (/secret|password|token|key/i.test(key)) cloned[key] = '<redacted>';
  }
  return cloned;
}
