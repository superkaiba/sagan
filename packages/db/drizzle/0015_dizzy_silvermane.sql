CREATE SEQUENCE IF NOT EXISTS "experiments_number_seq" AS bigint START 364;--> statement-breakpoint
SELECT setval('experiments_number_seq', GREATEST(364, (SELECT COALESCE(MAX(number), 0) FROM experiments) + 1), false);--> statement-breakpoint
ALTER TABLE "experiments" ALTER COLUMN "number" SET DEFAULT nextval('experiments_number_seq');--> statement-breakpoint
ALTER SEQUENCE "experiments_number_seq" OWNED BY "experiments"."number";
