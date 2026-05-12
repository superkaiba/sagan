-- Wipe experiment-related test data before the GitHub-import migration.
-- Keeps users, sessions, projects, beliefs, lit_*, knowledge, daily logs, todos.
-- Run with: psql "$DATABASE_URL_DIRECT" -f scripts/wipe-experiments.sql

BEGIN;

DELETE FROM agent_run_events
 WHERE run_id IN (SELECT id FROM agent_runs WHERE scope_entity_kind = 'experiment');

DELETE FROM agent_runs
 WHERE scope_entity_kind = 'experiment';

DELETE FROM approval_requests
 WHERE entity_kind = 'experiment' OR experiment_id IS NOT NULL;

DELETE FROM figures
 WHERE entity_kind = 'experiment';

DELETE FROM comments
 WHERE entity_kind = 'experiment';

DELETE FROM edges
 WHERE from_kind = 'experiment' OR to_kind = 'experiment';

DELETE FROM workflow_events
 WHERE entity_kind = 'experiment';

DELETE FROM runs;

DELETE FROM experiments;

-- Sanity check counts (should all be 0)
SELECT 'experiments'         AS t, COUNT(*) FROM experiments
UNION ALL SELECT 'runs',                    COUNT(*) FROM runs
UNION ALL SELECT 'workflow_events_exp',     COUNT(*) FROM workflow_events    WHERE entity_kind = 'experiment'
UNION ALL SELECT 'comments_exp',            COUNT(*) FROM comments           WHERE entity_kind = 'experiment'
UNION ALL SELECT 'edges_exp',               COUNT(*) FROM edges              WHERE from_kind = 'experiment' OR to_kind = 'experiment'
UNION ALL SELECT 'agent_runs_exp',          COUNT(*) FROM agent_runs         WHERE scope_entity_kind = 'experiment'
UNION ALL SELECT 'approvals_exp',           COUNT(*) FROM approval_requests  WHERE entity_kind = 'experiment' OR experiment_id IS NOT NULL
UNION ALL SELECT 'figures_exp',             COUNT(*) FROM figures            WHERE entity_kind = 'experiment';

COMMIT;
