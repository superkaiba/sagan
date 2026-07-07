import { NextResponse } from 'next/server';

/**
 * Kill switch for Claude Code / agent access from the dashboard
 * (2026-07-06, introduced alongside making the dashboard publicly
 * viewable without login). Every web surface that would enqueue an
 * agent run, pg_notify the VM runner, or call the Anthropic API
 * inline checks this flag first. Set SAGAN_ENABLE_AGENT_DISPATCH=1
 * to re-enable.
 */
export const agentDispatchEnabled = process.env.SAGAN_ENABLE_AGENT_DISPATCH === '1';

export function agentDispatchDisabledResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'agent_dispatch_disabled',
      message: 'Claude Code access is disabled on this dashboard.',
    },
    { status: 403 },
  );
}
