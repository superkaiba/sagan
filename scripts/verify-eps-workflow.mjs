#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function assertFile(path) {
  assert.ok(existsSync(join(root, path)), `${path} should exist`);
}

function stringArrayFromBlock(text, startPattern, label) {
  const start = text.search(startPattern);
  assert.notEqual(start, -1, `${label} block should exist`);
  const open = text.indexOf('[', start);
  assert.notEqual(open, -1, `${label} array should open`);
  const close = text.indexOf(']', open);
  assert.notEqual(close, -1, `${label} array should close`);
  const body = text.slice(open + 1, close);
  return [...body.matchAll(/['"]([a-z0-9_]+)['"]/g)].map((match) => match[1]);
}

function yamlList(text, key) {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim() === `${key}:`);
  assert.notEqual(index, -1, `${key} should exist in workflow yaml`);
  const values = [];
  for (const line of lines.slice(index + 1)) {
    if (/^\S/.test(line) && !line.startsWith('- ')) break;
    const match = line.match(/^\s+-\s+([a-z0-9_:-]+)/);
    if (match) values.push(match[1]);
  }
  return values;
}

const dbSchema = read('packages/db/src/schema/index.ts');
const apiSchema = read('packages/api/src/schemas/index.ts');
const workflowLib = read('apps/web/src/lib/workflow.ts');
const dashboard = read('apps/web/src/lib/dashboard.ts');
const workflowYaml = read('.claude/workflow.yaml');

const dbStatuses = stringArrayFromBlock(dbSchema, /experimentStatusEnum\s*=\s*pgEnum\('experiment_status'/, 'db experiment_status');
const apiStatuses = stringArrayFromBlock(apiSchema, /experimentStatusSchema\s*=\s*z\.enum/, 'api experimentStatusSchema');
const webStatuses = stringArrayFromBlock(workflowLib, /EXPERIMENT_STATUSES\s*=\s*\[/, 'web EXPERIMENT_STATUSES');
const dashboardStatuses = stringArrayFromBlock(dashboard, /DASHBOARD_EXPERIMENT_STATUSES\s*=\s*\[/, 'dashboard statuses');
const yamlStatuses = yamlList(workflowYaml, 'statuses');

assert.deepEqual(apiStatuses, dbStatuses, 'API experiment statuses should match DB enum');
assert.deepEqual(webStatuses, dbStatuses, 'web workflow statuses should match DB enum');
assert.deepEqual(dashboardStatuses, dbStatuses, 'dashboard statuses should match DB enum');
assert.deepEqual(yamlStatuses, dbStatuses, 'workflow YAML statuses should match DB enum');
assert.ok(dbStatuses.includes('clarifying'), 'clarifying status should be durable');

const lifecycle = yamlList(workflowYaml, 'canonical_lifecycle');
assert.deepEqual(lifecycle.slice(0, 3), ['proposed', 'clarifying', 'planning'], 'canonical lifecycle should clarify before planning');
assert.match(workflowYaml, /specific_hypothesis/);
assert.match(workflowYaml, /expected_information_gain/);
assert.match(workflowYaml, /after_round_3_rule/);

assert.match(dashboard, /key:\s*'clarifying'/, 'dashboard should expose clarifying stage');
assert.match(dashboard, /status === 'clarifying'\).*return 'clarifying'|status === 'clarifying'\) return 'clarifying'/s, 'dashboard should map clarifying status');
const experimentStageBody = dashboard.match(/function experimentStage[\s\S]*?function cleanResultStage/)?.[0] ?? '';
assert.ok(experimentStageBody, 'dashboard experimentStage function should exist');
for (const status of dbStatuses) {
  assert.match(experimentStageBody, new RegExp(`'${status}'`), `dashboard experimentStage should deterministically map ${status}`);
}

const pipelineAdvance = read('apps/web/app/api/pipeline/advance/route.ts');
assert.match(pipelineAdvance, /'clarifying'/, 'pipeline advance schema should include clarifying');
assert.match(pipelineAdvance, /clarifying:\s*'clarifying'/, 'pipeline stage should move experiments to clarifying');
assert.match(pipelineAdvance, /hypothesis, expected information gain/s, 'clarifying prompt should focus on hypothesis and information gain');

assertFile('apps/web/app/api/experiments/by-number/[n]/route.ts');
assertFile('apps/web/app/api/experiments/[id]/workflow-events/route.ts');
assertFile('scripts/sagan_state.py');
const client = read('scripts/sagan_state.py');
for (const command of ['view', 'status', 'marker', 'patch', 'clean-result', 'promote']) {
  assert.match(client, new RegExp(`sub\\.add_parser\\("${command}"`), `sagan_state.py should implement ${command}`);
}
assert.match(client, /aliases=\["markers"\]/, 'sagan_state.py should accept markers as a marker command alias');
assert.match(client, /SAGAN_API_TOKEN/, 'client should use API-token auth');

const reviewerLoops = read('apps/web/src/lib/reviewer-loops.ts');
assert.match(reviewerLoops, /MAX_REVIEW_ROUNDS\s*=\s*3/, 'reviewer loops should cap at 3');
for (const verdict of ['pass', 'needs_targeted_fix', 'blocked_needs_user_decision', 'fail_not_worth_continuing']) {
  assert.match(reviewerLoops, new RegExp(`'${verdict}'`), `review verdict ${verdict} should be allowed`);
}
assert.match(reviewerLoops, /round_three_disagreement_cannot_block/, 'round-3 disagreement should not block');
assert.match(read('apps/web/app/api/experiments/[id]/workflow-events/route.ts'), /validateReviewerLoopEvent/, 'workflow-event API should enforce reviewer-loop rules');

const dispatcher = read('services/runner/src/dispatcher.ts');
for (const envVar of ['SAGAN_PROGRESS_URL', 'SAGAN_POD_PROGRESS_TOKEN', 'SAGAN_AGENT_RUN_ID', 'SAGAN_EXPERIMENT_ID', 'SAGAN_RUN_INDEX']) {
  assert.match(dispatcher, new RegExp(envVar), `dispatcher should inject ${envVar}`);
}
assert.match(read('apps/web/app/api/runpods/progress/route.ts'), /marker_type:\s*'epm:progress'/, 'RunPod progress should create workflow progress markers');
assert.match(read('apps/web/app/api/experiments/[id]/promote/route.ts'), /status:\s*'completed'/, 'promotion should complete experiments');

for (const path of [
  '.claude/skills/issue/SKILL.md',
  '.claude/skills/issue/markers.md',
  '.claude/agents/experiment-planner.md',
  '.claude/agents/code-reviewer.md',
  '.claude/agents/codex-code-reviewer.md',
  '.claude/agents/interpretation-critic.md',
  '.claude/agents/codex-interpretation-critic.md',
  '.claude/agents/clean-result-critic.md',
  '.claude/agents/codex-clean-result-critic.md',
  '.claude/agents/reconciler.md',
  '.claude/agents/analyzer.md',
  '.claude/agents/follow-up-proposer.md',
  '.claude/agents/experiment-implementer.md',
  '.claude/agents/experimenter.md',
  '.claude/agents/uploader.md',
  '.claude/agents/upload-verifier.md',
  '.claude/agents/consistency-checker.md',
  'docs/eps-sagan-workflow-integration.md',
]) {
  assertFile(path);
}

console.log('EPS workflow verifier passed');
