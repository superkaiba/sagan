#!/usr/bin/env bash
# Safe wrapper around `sudo systemctl restart sagan-runner`.
#
# Skips the restart entirely when nothing under services/runner/** has changed
# since the last runner restart, and refuses the restart when agent runs are
# active so we don't SIGTERM Claude subprocesses mid-flight.
#
# Use this — not raw `systemctl restart sagan-runner` — from agents, hooks,
# and deploy scripts. CLAUDE.md documents the contract.
#
# Flags:
#   --force      bypass the active-run check (still records the new SHA)
#   --dry-run    print what would happen without restarting
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHA_FILE="${SAGAN_RUNNER_SHA_FILE:-$HOME/.sagan-runner-sha}"
RUNNER_PATH="services/runner"

FORCE=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

cd "$REPO_ROOT"

current_sha="$(git rev-parse HEAD)"
recorded_sha=""
if [[ -f "$SHA_FILE" ]]; then
  recorded_sha="$(<"$SHA_FILE")"
fi

if [[ -z "$recorded_sha" ]]; then
  echo "no recorded runner SHA at $SHA_FILE — treating as first restart"
  needs_restart=1
elif [[ "$recorded_sha" == "$current_sha" ]]; then
  echo "runner already at $current_sha; skipping restart"
  exit 0
else
  # Look for changes under services/runner/ between recorded and current SHA.
  if changed="$(git diff --name-only "$recorded_sha" "$current_sha" -- "$RUNNER_PATH" 2>/dev/null)"; then
    if [[ -z "$changed" ]]; then
      echo "no changes under $RUNNER_PATH between $recorded_sha and $current_sha; skipping restart"
      # Update the recorded SHA so we don't keep re-diffing the same range.
      printf '%s\n' "$current_sha" > "$SHA_FILE"
      exit 0
    fi
    needs_restart=1
    echo "$RUNNER_PATH changed since last restart:"
    echo "$changed" | sed 's/^/  /'
  else
    echo "could not diff $recorded_sha..$current_sha (commit missing?); treating as needs-restart"
    needs_restart=1
  fi
fi

if [[ "$needs_restart" -eq 1 && "$FORCE" -ne 1 ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "psql not available; cannot check active runs. Use --force to override." >&2
    exit 3
  fi
  if [[ -f "$REPO_ROOT/.env" ]]; then
    # shellcheck disable=SC1091
    set -a; . "$REPO_ROOT/.env"; set +a
  fi
  conn="${DATABASE_URL_DIRECT:-${DATABASE_URL:-}}"
  if [[ -z "$conn" ]]; then
    echo "DATABASE_URL[_DIRECT] not set; cannot check active runs. Use --force to override." >&2
    exit 3
  fi
  # Only `running` (a live Claude SDK session) and `deploying` (mid-pod
  # dispatch) are real SIGTERM-mid-flight risks. `queued` / `approved` get
  # picked back up after restart; `awaiting_approval` is just waiting on
  # human input. Don't treat those as blockers.
  active_count="$(psql "$conn" -At -c "SELECT count(*) FROM agent_runs WHERE status IN ('running','deploying');" 2>/dev/null || echo "")"
  if [[ -z "$active_count" ]]; then
    echo "failed to query active runs; refusing without --force" >&2
    exit 3
  fi
  if [[ "$active_count" -gt 0 ]]; then
    echo "REFUSING restart: $active_count agent run(s) in flight (running/deploying)." >&2
    echo "Wait for them to finish, or pass --force to restart anyway (will SIGTERM in-flight Claude subprocesses)." >&2
    exit 4
  fi
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "DRY RUN: would restart sagan-runner and record SHA $current_sha"
  exit 0
fi

echo "restarting sagan-runner to pick up $current_sha"
sudo systemctl restart sagan-runner
printf '%s\n' "$current_sha" > "$SHA_FILE"
echo "recorded $current_sha in $SHA_FILE"
