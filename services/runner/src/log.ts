/* Minimal timestamped logger. */
import { env } from './env.js';

const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof levels;

const threshold = levels[env.RUNNER_LOG_LEVEL as Level] ?? levels.info;

function format(level: Level, msg: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const head = `[${ts}] [${level}]`;
  if (!meta) return `${head} ${msg}`;
  return `${head} ${msg} ${JSON.stringify(meta)}`;
}

export const log = {
  debug(msg: string, meta?: Record<string, unknown>) {
    if (levels.debug >= threshold) console.log(format('debug', msg, meta));
  },
  info(msg: string, meta?: Record<string, unknown>) {
    if (levels.info >= threshold) console.log(format('info', msg, meta));
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    if (levels.warn >= threshold) console.warn(format('warn', msg, meta));
  },
  error(msg: string, meta?: Record<string, unknown>) {
    if (levels.error >= threshold) console.error(format('error', msg, meta));
  },
};
