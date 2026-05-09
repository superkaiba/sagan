import { hash, verify } from '@node-rs/argon2';

const PARAMS = {
  memoryCost: 19_456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 8) throw new Error('password must be at least 8 characters');
  if (plain.length > 256) throw new Error('password must be at most 256 characters');
  return hash(plain, PARAMS);
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  return verify(stored, plain, PARAMS);
}
