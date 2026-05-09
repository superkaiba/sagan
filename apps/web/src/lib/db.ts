import { getDb } from '@eps/db';
// Re-exports below.

// Re-export the singleton from @eps/db so route handlers and Server Components
// share one connection pool per process.
export { getDb };
export const db = () => getDb();
