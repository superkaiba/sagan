# @sagan/db

Drizzle schema, client, and migration runner.

## Setup

1. Set `DATABASE_URL` in `.env` at the repo root.
2. Enable the `vector` extension on your Postgres before generating migrations:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

3. Generate the initial migration:

   ```bash
   pnpm --filter @sagan/db db:generate
   ```

4. Apply migrations:

   ```bash
   pnpm --filter @sagan/db db:migrate
   ```

## Notes

- All embedding columns use `vector(1536)` (OpenAI `text-embedding-3-small` dimensions).
- All polymorphic FKs use `(entity_kind, entity_id)` pairs (no DB-level FK; integrity enforced at the application layer).
