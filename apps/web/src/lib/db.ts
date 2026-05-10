import { getDb } from '@sagan/db';
// Re-exports below.

// Re-export the singleton from @sagan/db so route handlers and Server Components
// share one connection pool per process.
export { getDb };
export const db = () => getDb();
