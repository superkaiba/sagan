import type { Config } from 'drizzle-kit';

// Prefer the direct (non-pooled) URL for migrations because the Neon pooler
// does not allow all DDL statements drizzle-kit generates.
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL[_DIRECT] must be set for drizzle-kit commands');
}

export default {
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
} satisfies Config;
