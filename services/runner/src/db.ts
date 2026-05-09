import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@eps/db/schema';
import { env, requireEnv } from './env.js';

// Two clients:
// - `pool`: short query connections, used by drizzle for inserts/updates.
// - `listener`: a single dedicated connection for LISTEN/NOTIFY. The Neon
//   pooler does not support LISTEN, so the listener always uses the direct URL.
let _pool: ReturnType<typeof postgres> | undefined;
let _drizzle: ReturnType<typeof drizzle<typeof schema>> | undefined;
let _listener: ReturnType<typeof postgres> | undefined;

export function db() {
  if (_drizzle) return _drizzle;
  const url = requireEnv('DATABASE_URL_DIRECT');
  _pool = postgres(url, { max: 5, prepare: false });
  _drizzle = drizzle(_pool, { schema, logger: env.RUNNER_LOG_LEVEL === 'debug' });
  return _drizzle;
}

export function listener() {
  if (_listener) return _listener;
  const url = requireEnv('DATABASE_URL_DIRECT');
  _listener = postgres(url, {
    max: 1,
    prepare: false,
    idle_timeout: 0, // never close
    connect_timeout: 30,
  });
  return _listener;
}

export async function close() {
  await Promise.allSettled([
    _pool ? _pool.end({ timeout: 5 }) : Promise.resolve(),
    _listener ? _listener.end({ timeout: 5 }) : Promise.resolve(),
  ]);
  _pool = undefined;
  _drizzle = undefined;
  _listener = undefined;
}

export { schema };
