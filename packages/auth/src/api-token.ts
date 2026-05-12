import { randomBytes, createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { apiTokens, users, type ApiToken, type Db, type User } from '@sagan/db';

const TOKEN_PREFIX = 'sk_';
const PREFIX_DISPLAY_LENGTH = 12;

export interface ApiTokenContext {
  token: Pick<ApiToken, 'id' | 'userId' | 'name' | 'prefix' | 'expiresAt'>;
  user: Pick<User, 'id' | 'email' | 'displayName' | 'role'>;
}

export interface MintedApiToken {
  id: string;
  name: string;
  prefix: string;
  plaintext: string;
  createdAt: Date;
  expiresAt: Date | null;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateToken(): { plaintext: string; prefix: string } {
  const body = randomBytes(32).toString('base64url');
  const plaintext = `${TOKEN_PREFIX}${body}`;
  return { plaintext, prefix: plaintext.slice(0, PREFIX_DISPLAY_LENGTH) };
}

export function looksLikeApiToken(raw: string): boolean {
  return raw.startsWith(TOKEN_PREFIX);
}

export async function createApiToken(
  db: Db,
  userId: string,
  name: string,
  expiresAt: Date | null = null,
): Promise<MintedApiToken> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('api_token_name_required');
  const { plaintext, prefix } = generateToken();
  const tokenHash = hashToken(plaintext);
  const inserted = await db
    .insert(apiTokens)
    .values({ userId, name: trimmed, tokenHash, prefix, expiresAt })
    .returning({ id: apiTokens.id, createdAt: apiTokens.createdAt, expiresAt: apiTokens.expiresAt });
  if (inserted.length === 0) throw new Error('api_token_insert_failed');
  const row = inserted[0]!;
  return {
    id: row.id,
    name: trimmed,
    prefix,
    plaintext,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

export async function validateApiToken(db: Db, rawToken: string): Promise<ApiTokenContext | null> {
  if (!looksLikeApiToken(rawToken)) return null;
  const tokenHash = hashToken(rawToken);
  const rows = await db
    .select({
      token: {
        id: apiTokens.id,
        userId: apiTokens.userId,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        expiresAt: apiTokens.expiresAt,
      },
      user: { id: users.id, email: users.email, displayName: users.displayName, role: users.role },
    })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.token.expiresAt && row.token.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  // Fire-and-forget last_used_at update.
  void db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.token.id));

  return { token: row.token, user: row.user };
}

export async function listApiTokens(db: Db, userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(apiTokens.createdAt);
}

export async function revokeApiToken(db: Db, userId: string, id: string): Promise<boolean> {
  const result = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
    .returning({ id: apiTokens.id });
  return result.length > 0;
}
