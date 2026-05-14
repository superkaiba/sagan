/**
 * Pod-side bootstrap that ports the relevant slices of EPS's
 * `scripts/bootstrap_pod.sh` into the dockerArgs that Sagan dispatches.
 *
 * EPS-era model: pod boots vanilla, then a local script (`bootstrap_pod.sh`)
 * SSHes in and pushes `.env`, clones the repo, installs uv, syncs deps, sets
 * up cache redirects, starts a log shipper. Then a human SSHes in again to
 * launch the experiment.
 *
 * Sagan-era model: pod boots running a self-contained dockerArgs that does
 * all of the above without SSH. The planner authors only the actual
 * experiment command; this wrapper supplies the bootstrap and runs the
 * planner's command at the end.
 *
 * Auto-skip: planners that already inlined their own bootstrap (legacy plans
 * like #363, #366, #333) keep working. Detection is by the `# sagan:no-wrap`
 * sentinel or a `git clone` substring.
 */

export interface BootstrapWrapInput {
  dockerArgs?: string;
  env?: Record<string, string>;
}

export interface BootstrapWrapResult {
  dockerArgs: string;
  envAdditions: Record<string, string>;
  wrapped: boolean;
}

/**
 * Decide whether to wrap the planner's dockerArgs with Sagan's bootstrap.
 *
 * Skip wrap when:
 *   - dockerArgs is absent (pod boots interactively / nothing to run)
 *   - dockerArgs already contains `git clone` (legacy fat-dockerArgs plan)
 *   - dockerArgs starts with the `# sagan:no-wrap` sentinel
 */
export function wrapDockerArgsForBootstrap(input: BootstrapWrapInput): BootstrapWrapResult {
  const original = input.dockerArgs ?? '';
  if (!original.trim()) {
    return { dockerArgs: original, envAdditions: {}, wrapped: false };
  }
  if (shouldSkipWrap(original)) {
    return { dockerArgs: original, envAdditions: {}, wrapped: false };
  }
  // Pass the planner's command as a base64 env var. Decoded on the pod and
  // executed via `bash`. Base64 sidesteps every quoting trap that arises when
  // the planner's command itself includes single quotes, dollar signs, or
  // newlines.
  const userCmdB64 = Buffer.from(original, 'utf8').toString('base64');
  return {
    dockerArgs: `bash -lc ${shellSingleQuote(BOOTSTRAP_SCRIPT)}`,
    envAdditions: { SAGAN_USER_CMD_B64: userCmdB64 },
    wrapped: true,
  };
}

function shouldSkipWrap(dockerArgs: string): boolean {
  const head = dockerArgs.slice(0, 200);
  if (/#\s*sagan:no-wrap/i.test(head)) return true;
  if (/\bgit\s+clone\b/.test(dockerArgs)) return true;
  return false;
}

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// The bootstrap snippet that runs inside the pod. Keep this self-contained:
// it must work with only the env vars Sagan injects (SAGAN_*, the forwarded
// CLIENT_ENV_ALLOWLIST set, and SAGAN_USER_CMD_B64).
const BOOTSTRAP_SCRIPT = `
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

# ─── Required env (set by Sagan dispatcher) ────────────────────────────────
: "\${GITHUB_TOKEN:?GITHUB_TOKEN missing — check Sagan client-repo .env forwarding}"
: "\${SAGAN_EPS_BRANCH:?SAGAN_EPS_BRANCH missing — orchestrator must set pod_spec.env.SAGAN_EPS_BRANCH after the implementer pushes the per-experiment branch}"
: "\${SAGAN_USER_CMD_B64:?SAGAN_USER_CMD_B64 missing — dispatcher wrapper is broken}"

# ─── Cache redirects (bootstrap_pod.sh step 6) ─────────────────────────────
export HF_HOME=/workspace/.cache/huggingface
export WANDB_CACHE_DIR=/workspace/.cache/wandb
export WANDB_DATA_DIR=/workspace/.cache/wandb
export UV_CACHE_DIR=/workspace/.cache/uv
export TRITON_CACHE_DIR=/workspace/.cache/triton
mkdir -p "$HF_HOME" "$WANDB_CACHE_DIR" "$UV_CACHE_DIR" "$TRITON_CACHE_DIR"

# ─── Install uv if missing (bootstrap_pod.sh step 2) ───────────────────────
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

# ─── Clone or fast-forward client repo at the implementer's branch ─────────
# (bootstrap_pod.sh step 4, but tokenized URL retained on disk so subsequent
# resume cycles re-auth without extra setup; this branch is short-lived per
# experiment.)
REPO=/workspace/explore-persona-space
REMOTE="https://x-access-token:\${GITHUB_TOKEN}@github.com/superkaiba/explore-persona-space.git"
unset HISTFILE
if [ -d "$REPO/.git" ]; then
  cd "$REPO"
  git remote set-url origin "$REMOTE"
  git fetch origin "$SAGAN_EPS_BRANCH"
  git checkout -B "$SAGAN_EPS_BRANCH" "origin/$SAGAN_EPS_BRANCH"
  git reset --hard "origin/$SAGAN_EPS_BRANCH"
else
  mkdir -p "$REPO"
  cd "$REPO"
  git init -q -b main
  git remote add origin "$REMOTE"
  git fetch origin "$SAGAN_EPS_BRANCH"
  git checkout -B "$SAGAN_EPS_BRANCH" "origin/$SAGAN_EPS_BRANCH"
  git reset --hard "origin/$SAGAN_EPS_BRANCH"
fi

# ─── Write forwarded env vars into .env for dotenv consumers ───────────────
# (bootstrap_pod.sh step 3 minus the scp — Sagan already injected the values
# as container env, this just makes them visible to code that loads .env via
# python-dotenv etc.)
{
  for k in \\
    GITHUB_TOKEN HF_TOKEN HF_HUB_TOKEN HUGGINGFACE_TOKEN HUGGING_FACE_HUB_TOKEN \\
    WANDB_API_KEY WANDB_BASE_URL WANDB_ENTITY \\
    OPENAI_API_KEY ANTHROPIC_API_KEY GOOGLE_API_KEY TOGETHER_API_KEY \\
    HF_HOME WANDB_CACHE_DIR WANDB_DATA_DIR UV_CACHE_DIR TRITON_CACHE_DIR \\
    SAGAN_PROGRESS_URL SAGAN_POD_PROGRESS_TOKEN SAGAN_AGENT_RUN_ID \\
    SAGAN_EXPERIMENT_ID SAGAN_RUN_INDEX SAGAN_EPS_BRANCH SAGAN_EPS_COMMIT_SHA; do
    v="\${!k:-}"
    [ -n "$v" ] && printf '%s=%s\\n' "$k" "$v"
  done
} > "$REPO/.env"

# ─── Install Python deps (bootstrap_pod.sh step 5) ─────────────────────────
uv sync --locked

# ─── POST progress ─────────────────────────────────────────────────────────
# Always send {progressPct, message}; optionally include an errorTail field
# (tail of stderr) on failure so dashboards / the orchestrator see the actual
# failure reason instead of a bare exit code.
post_progress() {
  local pct="$1"; local msg="$2"; local error_tail="\${3:-}"
  if [ -z "\${SAGAN_PROGRESS_URL:-}" ] || [ -z "\${SAGAN_POD_PROGRESS_TOKEN:-}" ]; then
    return 0
  fi
  python3 - "$pct" "$msg" "$error_tail" <<'PY' || true
import json, os, sys, urllib.request
pct = float(sys.argv[1])
msg = sys.argv[2]
err = sys.argv[3]
body = {"progressPct": pct, "message": msg}
if err:
    body["errorTail"] = err[-15500:]
req = urllib.request.Request(
    os.environ["SAGAN_PROGRESS_URL"],
    data=json.dumps(body).encode("utf-8"),
    headers={
        "authorization": "Bearer " + os.environ["SAGAN_POD_PROGRESS_TOKEN"],
        "content-type": "application/json",
    },
    method="POST",
)
try:
    urllib.request.urlopen(req, timeout=15).read()
except Exception as exc:
    sys.stderr.write("sagan-progress post failed: " + str(exc))
PY
}
post_progress 5 "bootstrap complete on branch $SAGAN_EPS_BRANCH"

# ─── Heartbeat: declining wall-clock ETA, no event-row spam ────────────────
# Spawns a background loop that POSTs {estimatedRemainingMinutes:N, heartbeat:true}
# every 90s while the user-cmd is running. The webhook's heartbeat:true flag
# updates pod_lifecycle.metadata + experiments.plan_json (so the dashboard
# sidebar's "Nm left · $X.XX" ticks) but skips the agent_run_events /
# workflow_events insert so the timeline doesn't fill with heartbeats.
# Quiet no-op when SAGAN_ESTIMATED_MINUTES is unset.
HEARTBEAT_PID=""
if [ -n "\${SAGAN_ESTIMATED_MINUTES:-}" ] && [ -n "\${SAGAN_PROGRESS_URL:-}" ] && [ -n "\${SAGAN_POD_PROGRESS_TOKEN:-}" ]; then
  START_EPOCH=$(date +%s)
  (
    sleep 30  # initial offset so the user-cmd posts its first ETA first if it wants
    while true; do
      ELAPSED_MIN=$(( ($(date +%s) - START_EPOCH) / 60 ))
      REMAINING=$(( SAGAN_ESTIMATED_MINUTES - ELAPSED_MIN ))
      if [ "$REMAINING" -lt 0 ]; then REMAINING=0; fi
      python3 - "$REMAINING" "$ELAPSED_MIN" <<'PY' || true
import json, os, sys, urllib.request
remaining = int(sys.argv[1])
elapsed = int(sys.argv[2])
body = {
    "estimatedRemainingMinutes": remaining,
    "heartbeat": True,
    "message": f"heartbeat: {elapsed}m elapsed, ~{remaining}m left",
}
req = urllib.request.Request(
    os.environ["SAGAN_PROGRESS_URL"],
    data=json.dumps(body).encode("utf-8"),
    headers={
        "authorization": "Bearer " + os.environ["SAGAN_POD_PROGRESS_TOKEN"],
        "content-type": "application/json",
    },
    method="POST",
)
try:
    urllib.request.urlopen(req, timeout=15).read()
except Exception:
    pass  # best-effort; pod transient network blips are not fatal
PY
      sleep 90
    done
  ) &
  HEARTBEAT_PID=$!
fi

# ─── Decode and run the planner's command ──────────────────────────────────
# Capture stdout to /tmp/sagan_user.out and stderr to /tmp/sagan_user.err so
# we can tail the actual failure into the progress webhook on non-zero exit.
echo "$SAGAN_USER_CMD_B64" | base64 -d > /tmp/sagan_user_cmd.sh
chmod +x /tmp/sagan_user_cmd.sh

# Force \`pipefail\` for the user cmd and any bash subshells it spawns.
# Bash reads SHELLOPTS from the environment at startup and enables every
# listed option before any startup files run, so an inner \`bash -lc '… | tee …'\`
# inherits it too. Without this, a planner using \`cmd | tee log\` masks cmd's
# exit code (tee always returns 0), so a crashed experiment looks like success
# to this wrapper. Combined with RunPod's restart-on-exit policy, that
# produced an hours-long bootstrap → fake-100% → restart loop on exp-192.
set +e
SHELLOPTS=pipefail bash /tmp/sagan_user_cmd.sh > >(tee /tmp/sagan_user.out) 2> >(tee /tmp/sagan_user.err >&2)
EXIT_CODE=$?
set -e

# Stop the heartbeat once user-cmd has exited (success or failure).
if [ -n "$HEARTBEAT_PID" ]; then
  kill "$HEARTBEAT_PID" 2>/dev/null || true
fi

if [ "$EXIT_CODE" -eq 0 ]; then
  post_progress 100 "experiment completed"
else
  # Capture the last 15.5KB of stderr. If stderr is empty, fall back to the
  # last 15.5KB of stdout (some scripts print errors to stdout).
  ERROR_TAIL=""
  if [ -s /tmp/sagan_user.err ]; then
    ERROR_TAIL="$(tail -c 15500 /tmp/sagan_user.err 2>/dev/null || true)"
  fi
  if [ -z "$ERROR_TAIL" ] && [ -s /tmp/sagan_user.out ]; then
    ERROR_TAIL="$(tail -c 15500 /tmp/sagan_user.out 2>/dev/null || true)"
  fi
  post_progress 0 "experiment exited with code $EXIT_CODE" "$ERROR_TAIL"
fi

# Do NOT \`exit\`. RunPod auto-restarts the container when the entrypoint exits
# (regardless of exit code), which turns any quick success-or-failure into a
# bootstrap → user-cmd → bootstrap loop that burns money until manually killed
# (see exp-192 incident, 7980 progress events over 8h with no real work done).
# Stay alive so the orchestrator / owner can SSH in, fetch artifacts on
# success, or inspect /tmp/sagan_user.{out,err} on failure. The watcher /
# uploader will issue an explicit \`terminatePod\` API call when done.
echo "[sagan] bootstrap done: exit_code=$EXIT_CODE — sleeping to prevent RunPod restart loop"
sleep infinity
`.trim();
