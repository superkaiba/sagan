-- Replace lit_read_state with a richer taxonomy:
--   old: unread, queued, reading, read, archived
--   new: unread, summary_read, saved_for_later, reading, read, read_deeply
--
-- Postgres can't drop enum values in place, so we swap the type. All
-- existing rows are currently 'unread' (see CHECK in commit message), but the
-- CASE expression below maps the old values that this migration *does* keep
-- ('reading', 'read') through unchanged, and folds the two dropped values
-- ('queued', 'archived') into nearby new ones ('saved_for_later' and 'read'
-- respectively) so the migration is safe even if rows show up mid-deploy.
ALTER TABLE "public"."lit_items" ALTER COLUMN "read_state" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."lit_items" ALTER COLUMN "read_state" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."lit_read_state";--> statement-breakpoint
CREATE TYPE "public"."lit_read_state" AS ENUM('unread', 'summary_read', 'saved_for_later', 'reading', 'read', 'read_deeply');--> statement-breakpoint
ALTER TABLE "public"."lit_items"
  ALTER COLUMN "read_state" SET DATA TYPE "public"."lit_read_state"
  USING (CASE
    WHEN "read_state" = 'queued'   THEN 'saved_for_later'
    WHEN "read_state" = 'archived' THEN 'read'
    ELSE "read_state"
  END)::"public"."lit_read_state";--> statement-breakpoint
ALTER TABLE "public"."lit_items" ALTER COLUMN "read_state" SET DEFAULT 'unread';
