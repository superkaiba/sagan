/**
 * One-shot seed: ensures the single owner user row exists.
 * Run with: `pnpm --filter @eps/db tsx src/seed.ts`
 *
 * Idempotent: re-running with the same email is a no-op (does not rotate
 * the password). Pass `--rotate-password` to forcibly update the hash.
 */
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { hash } from '@node-rs/argon2';
import { users } from './schema/index';

async function main() {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  const email = process.env.DASHBOARD_OWNER_EMAIL;
  const password = process.env.DASHBOARD_OWNER_PASSWORD;

  if (!url) throw new Error('DATABASE_URL[_DIRECT] is not set');
  if (!email) throw new Error('DASHBOARD_OWNER_EMAIL is not set');
  if (!password) throw new Error('DASHBOARD_OWNER_PASSWORD is not set');

  const rotate = process.argv.includes('--rotate-password');

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const passwordHash = await hash(password, {
    memoryCost: 19_456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });

  if (existing.length === 0) {
    await db.insert(users).values({ email, passwordHash, displayName: 'Thomas' });
    console.log(`seeded owner user ${email}`);
  } else if (rotate) {
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.email, email));
    console.log(`rotated password for ${email}`);
  } else {
    console.log(`user ${email} already exists; pass --rotate-password to update`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
