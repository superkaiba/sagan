import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

let _client: ReturnType<typeof postgres> | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb(connectionString = process.env.DATABASE_URL) {
  if (_db) return _db;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  _client = postgres(connectionString, { max: 10, prepare: false });
  _db = drizzle(_client, { schema, logger: process.env.DB_DEBUG === '1' });
  return _db;
}

export async function closeDb() {
  if (_client) {
    await _client.end({ timeout: 5 });
    _client = undefined;
    _db = undefined;
  }
}

export type Db = ReturnType<typeof getDb>;
