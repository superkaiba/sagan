-- Drop default first because it references the experiment_kind type
-- and would otherwise block the DROP TYPE.
ALTER TABLE "public"."experiments" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."experiments" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."experiment_kind";--> statement-breakpoint
CREATE TYPE "public"."experiment_kind" AS ENUM('experiment', 'infra', 'survey');--> statement-breakpoint
ALTER TABLE "public"."experiments" ALTER COLUMN "kind" SET DATA TYPE "public"."experiment_kind" USING "kind"::"public"."experiment_kind";--> statement-breakpoint
ALTER TABLE "public"."experiments" ALTER COLUMN "kind" SET DEFAULT 'experiment';
