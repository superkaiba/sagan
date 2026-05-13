ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "plan_md" text;--> statement-breakpoint

-- Backfill experiments.plan_md from the latest non-terminal experiment-kind
-- agent_run per experiment. This makes experiments.plan_md the canonical read
-- source for the dispatcher and the approval UI going forward. The agent_run
-- copy remains for per-run audit / history.
UPDATE "experiments" e
SET "plan_md" = ar."plan_md"
FROM (
  SELECT DISTINCT ON (ar.scope_entity_id)
    ar.scope_entity_id,
    ar.plan_md
  FROM "agent_runs" ar
  WHERE ar.scope_entity_kind = 'experiment'
    AND ar.kind = 'experiment'
    AND ar.plan_md IS NOT NULL
    AND ar.status NOT IN ('completed', 'failed', 'cancelled', 'rejected')
  ORDER BY ar.scope_entity_id, ar.updated_at DESC
) ar
WHERE e.id = ar.scope_entity_id
  AND e."plan_md" IS NULL;
