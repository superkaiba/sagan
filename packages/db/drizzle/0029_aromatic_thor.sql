ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "pod_spec" jsonb;--> statement-breakpoint

-- Backfill experiments.pod_spec from the runpod-spec fenced JSON block inside
-- experiments.plan_md. The dispatcher used to regex this out of the markdown
-- on every dispatch; storing it typed lets us delete that parser path and
-- validate at write time instead.
--
-- substring(text FROM 'pattern') returns the first capture group as text.
-- We then cast to jsonb. Skip rows where extraction fails (plan_md without a
-- runpod-spec block — those experiments aren't dispatchable anyway).
UPDATE "experiments"
SET "pod_spec" = (
  substring("plan_md" FROM E'```runpod-spec\\s*\\n([\\s\\S]*?)\\n```')
)::jsonb
WHERE "plan_md" IS NOT NULL
  AND "plan_md" LIKE '%```runpod-spec%'
  AND "pod_spec" IS NULL;
