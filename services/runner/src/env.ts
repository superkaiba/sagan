import 'dotenv/config';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// Load the repo-root .env if it hasn't already been picked up.
const repoRootEnv = path.resolve(process.cwd(), '../../.env');
loadEnv({ path: repoRootEnv, override: false });

export const env = {
  DATABASE_URL_DIRECT:
    process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? '',
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  RUNNER_LOG_LEVEL: process.env.RUNNER_LOG_LEVEL ?? 'info',
  RUNNER_REPO_ROOT:
    process.env.RUNNER_REPO_ROOT ?? path.resolve(process.cwd(), '../..'),
  // Path to the Claude Code CLI binary the agent SDK invokes. Defaults to the
  // user-installed binary; override to use a pinned version. The SDK's bundled
  // platform-specific binaries are flaky on systems where glibc/musl detection
  // misfires.
  CLAUDE_CLI_PATH:
    process.env.CLAUDE_CLI_PATH ?? '/home/thomasjiralerspong/.local/bin/claude',
};

export function requireEnv(key: keyof typeof env): string {
  const value = env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
}
