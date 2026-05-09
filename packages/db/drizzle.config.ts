import type { Config } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url) {
  // drizzle-kit reads this at startup; if missing, fail loud.
  throw new Error('DATABASE_URL must be set for drizzle-kit commands');
}

export default {
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
} satisfies Config;
