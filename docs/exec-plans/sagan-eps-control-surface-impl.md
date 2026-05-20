# Sagan EPS Control-Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sagan the human dashboard for EPS's local-file task workflow — view state, read timelines, comment, approve gates, promote — all without touching a terminal. The `/issue` skill in EPS stays the engine; Sagan reads via fs-watch and writes via `task.py` shell-outs.

**Architecture:** State machine on disk in EPS (`tasks/<status>/<N>/`); at-most-one `claude` CLI subprocess per task enforced by lockfile; Sagan's `services/runner` spawns those subprocesses with `cwd=EPS`; Sagan dashboard renders from a `chokidar`-tailed mirror cache and shells out to `task.py` for writes.

**Tech Stack:** Python 3.11 (EPS, argparse, flock, git), TypeScript / Node (Sagan runner, chokidar, drizzle-orm), Next.js 16 / React (Sagan web).

**Companion design doc:** `docs/exec-plans/sagan-eps-control-surface-plan.md` — read this first if context is missing.

---

## File Structure

### EPS (`/home/thomasjiralerspong/explore-persona-space`)

- **Create:** `scripts/orchestrator_lock.py` — acquire/release/status for `.orchestrator.pid` per task.
- **Create:** `tasks/CALLABLE_API.md` — documents the `task.py` subcommands Sagan shells out to.
- **Modify:** `scripts/task.py` — add `comment-add` subcommand; add `--source` flag to mutating subcommands; ensure `--json` exists where needed.
- **Modify:** `src/explore_persona_space/task_workflow.py` (or wherever the comments-writer should live) — add `append_comment(N, author, body_md, thread_id, reply_to, source)` helper used by `cmd_comment_add`.
- **Modify:** `.gitignore` — ignore `tasks/**/.orchestrator.pid`.
- **Modify:** `.claude/skills/issue/SKILL.md` (or wherever `/issue` is defined) — insert lock acquire at entry, release at every exit.
- **Modify:** `.claude/workflow.yaml` — update `awaiting_promotion` gate def to enumerate valid `source` values.
- **Modify:** `CLAUDE.md` — point `eps.superkaiba.com/tasks/<N>` references at `sagan.superkaiba.com/eps/t/<N>`.

### Sagan (`/home/thomasjiralerspong/sagan`)

- **Create:** `packages/workflow/package.json`, `packages/workflow/src/index.ts`, `packages/workflow/workflow.yaml` — vendored copy + TS parser.
- **Create:** `packages/db/src/schema/eps-task-mirror.ts` — Drizzle schema for the mirror cache table.
- **Create:** `packages/db/drizzle/000X_eps_task_mirror.sql` — migration (auto-generated).
- **Create:** `services/runner/src/lib/eps-orchestrator.ts` — `spawnIssueRun(taskN)`.
- **Create:** `services/runner/src/jobs/eps-mirror.ts` — chokidar fs-watch job + reconciliation.
- **Create:** `apps/web/src/lib/eps-task-api.ts` — server-side wrapper that shells out to `task.py`.
- **Create:** `apps/web/app/(app)/eps/board/page.tsx` — board view.
- **Create:** `apps/web/app/(app)/eps/t/[number]/page.tsx` — task detail page.
- **Create:** `apps/web/app/(app)/eps/t/[number]/ActionButtons.tsx`, `Timeline.tsx`, `Comments.tsx`, `AskClaudeModal.tsx`.
- **Create:** `apps/web/app/api/eps-task/[number]/{approve,block,unblock,promote,comment,ask-claude,pause,restart,start}/route.ts` — 9 route files.
- **Modify:** `packages/db/src/schema/agent-runs.ts` (or wherever) — add `epsTaskN: integer('eps_task_n')` column.
- **Modify:** `services/runner/src/dispatcher.ts`, `session.ts`, `watcher.ts`, `lib/agent-recovery.ts`, `lib/followups-watcher.ts` — accept `eps_orchestrator` and `eps_qa` kinds; remove EPS-experiment-specific logic.
- **Modify:** `apps/web/app/api/pipeline/advance/route.ts` — excise the experiment branch only.
- **Modify:** `apps/web/app/(app)/pipeline/PipelineBoard.tsx` — strip experiment-column wiring.
- **Modify:** `.env`, `.env.example` — add `SAGAN_CLIENT_REPOS`, `EPS_TASK_PY`, `EPS_TASKS_DIR`, `EPS_WORKFLOW_YAML`.
- **Modify:** `CLAUDE.md` — reverse the "EPS canonical in Sagan" guidance; relax tenant-agnostic guardrail.
- **Modify:** `docs/exec-plans/eps-workflow-port-plan.md`, `docs/eps-sagan-workflow-integration.md` — prepend superseded headers pointing to the new plan.

---

## Phase 0 — Setup and supersession

### Task 0.1: Mark obsolete docs as superseded

**Files:**
- Modify: `/home/thomasjiralerspong/sagan/docs/exec-plans/eps-workflow-port-plan.md` (top)
- Modify: `/home/thomasjiralerspong/sagan/docs/eps-sagan-workflow-integration.md` (top)

- [ ] **Step 1: Prepend supersession header to `eps-workflow-port-plan.md`**

Insert at the very top, before the existing `# EPS Workflow Port Plan` heading:

```markdown
> **SUPERSEDED 2026-05-20.** The direction in this document — "Sagan is the only workflow control plane," "Sagan is canonical" — has been reversed. EPS local files are now canonical workflow state; see `docs/exec-plans/sagan-eps-control-surface-plan.md` and `docs/exec-plans/sagan-eps-control-surface-impl.md` for the current direction. Read this only for historical context.

```

- [ ] **Step 2: Prepend supersession header to `eps-sagan-workflow-integration.md`**

Same pattern, at the top of the file:

```markdown
> **SUPERSEDED 2026-05-20.** This document describes the old model where Sagan owned EPS workflow state. EPS now owns its workflow state in local files. See `docs/exec-plans/sagan-eps-control-surface-plan.md`.

```

- [ ] **Step 3: Commit**

```bash
cd /home/thomasjiralerspong/sagan
git add docs/exec-plans/eps-workflow-port-plan.md docs/eps-sagan-workflow-integration.md
git commit -m "docs: mark old EPS-canonical-in-Sagan plans as superseded"
```

### Task 0.2: Create EPS worktree

**Files:** none (git operation)

- [ ] **Step 1: Confirm EPS main is clean enough to branch from**

```bash
cd /home/thomasjiralerspong/explore-persona-space
git status --short
```
Expected: existing dirty files in `.claude/agent-memory/` are present but don't block branching from current `HEAD`.

- [ ] **Step 2: Create the worktree**

```bash
cd /home/thomasjiralerspong/explore-persona-space
git worktree add .claude/worktrees/sagan-control-surface -b sagan-control-surface main
```
Expected: `Preparing worktree (new branch 'sagan-control-surface')` then `HEAD is now at <sha>`.

- [ ] **Step 3: Verify the worktree exists and is clean**

```bash
git -C /home/thomasjiralerspong/explore-persona-space/.claude/worktrees/sagan-control-surface status
```
Expected: `On branch sagan-control-surface … nothing to commit, working tree clean`.

### Task 0.3: Create Sagan worktree

**Files:** none (git operation)

- [ ] **Step 1: Create the worktree from current Sagan main (which now has the plan commits)**

```bash
cd /home/thomasjiralerspong/sagan
git worktree add .claude/worktrees/sagan-control-surface -b sagan-control-surface main
```

- [ ] **Step 2: Verify**

```bash
git -C /home/thomasjiralerspong/sagan/.claude/worktrees/sagan-control-surface log --oneline -3
```
Expected: includes the two plan-doc commits at the top.

---

## Phase 1 — EPS-side foundation

All EPS phase-1 work happens in the worktree `/home/thomasjiralerspong/explore-persona-space/.claude/worktrees/sagan-control-surface`. Replace `<eps>` with that path below.

### Task 1.1: Add `task.py comment-add` subcommand

**Files:**
- Create: `<eps>/tests/test_task_comment_add.py`
- Modify: `<eps>/src/explore_persona_space/task_workflow.py` — add `append_comment(...)` helper.
- Modify: `<eps>/scripts/task.py` — add `cmd_comment_add` + subparser.
- Modify: `<eps>/.gitignore` — ensure `tasks/**/.orchestrator.pid` is ignored (for the lock task, but easier to add here).

- [ ] **Step 1: Write the failing test**

Create `<eps>/tests/test_task_comment_add.py`:

```python
import json
import subprocess
import sys
from pathlib import Path

def test_comment_add_appends_to_comments_jsonl(tmp_repo, registered_task):
    """`task.py comment-add N --author=user --body-md=...` appends one JSONL line."""
    task_n = registered_task  # fixture: creates a proposed task, returns its number
    body = "What's the status here?"
    result = subprocess.run(
        [
            sys.executable, "scripts/task.py", "comment-add",
            str(task_n),
            "--author=user",
            f"--body-md={body}",
            "--source=sagan-user:test-session-abc",
        ],
        cwd=tmp_repo,
        capture_output=True,
        text=True,
        check=True,
    )
    # Should print the new comment as JSON on stdout (for callers).
    out = json.loads(result.stdout)
    assert out["author"] == "user"
    assert out["body_md"] == body
    assert out["source"] == "sagan-user:test-session-abc"
    assert "id" in out and "created_at" in out

    # comments.jsonl exists and contains exactly one line matching.
    folder = next((tmp_repo / "tasks").glob(f"*/{task_n}"))
    comments_path = folder / "comments.jsonl"
    lines = comments_path.read_text().strip().split("\n")
    assert len(lines) == 1
    parsed = json.loads(lines[0])
    assert parsed["body_md"] == body
    assert parsed["author"] == "user"


def test_comment_add_with_reply_to(tmp_repo, registered_task):
    """`--reply-to=<id>` is stored on the new comment."""
    task_n = registered_task
    # First comment
    r1 = subprocess.run(
        [sys.executable, "scripts/task.py", "comment-add", str(task_n),
         "--author=user", "--body-md=Q1"],
        cwd=tmp_repo, capture_output=True, text=True, check=True,
    )
    first_id = json.loads(r1.stdout)["id"]
    # Reply
    r2 = subprocess.run(
        [sys.executable, "scripts/task.py", "comment-add", str(task_n),
         "--author=claude", "--body-md=A1", f"--reply-to={first_id}"],
        cwd=tmp_repo, capture_output=True, text=True, check=True,
    )
    assert json.loads(r2.stdout)["reply_to"] == first_id
```

`tmp_repo` and `registered_task` fixtures should mirror existing `<eps>/tests/conftest.py` conventions. If those fixtures don't exist yet, also add them following the patterns of any neighbouring tests.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd <eps>
python -m pytest tests/test_task_comment_add.py -v
```
Expected: tests fail because `comment-add` subcommand doesn't exist yet (argparse error: `invalid choice: 'comment-add'`).

- [ ] **Step 3: Implement `append_comment` in `task_workflow.py`**

Locate the existing flock + commit helpers in `<eps>/src/explore_persona_space/task_workflow.py`. Add a new function alongside them:

```python
def append_comment(
    *,
    task_n: int,
    author: str,
    body_md: str,
    thread_id: str | None = None,
    reply_to: str | None = None,
    source: str | None = None,
) -> dict:
    """Append a comment line to tasks/<status>/<N>/comments.jsonl under flock.

    Returns the comment dict that was written.
    """
    if author not in ("user", "claude", "codex"):
        raise ValueError(f"invalid author: {author!r}")
    folder = find_task_folder(task_n)  # existing helper that locates tasks/<status>/<N>/
    comments_path = folder / "comments.jsonl"
    comment = {
        "id": _new_comment_id(),  # short ULID-ish string, e.g. "c_" + 12 chars
        "task_n": task_n,
        "author": author,
        "body_md": body_md,
        "thread_id": thread_id,
        "reply_to": reply_to,
        "source": source,
        "created_at": _now_iso(),
    }
    with _task_lock(task_n):  # existing flock helper
        with comments_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(comment, ensure_ascii=False) + "\n")
        _git_commit(
            paths=[comments_path],
            message=f"comment-add #{task_n}",
        )  # existing helper
    return comment
```

If the named helpers (`find_task_folder`, `_task_lock`, `_git_commit`, `_now_iso`) are spelled differently in the existing file, use the existing names — do not invent. `_new_comment_id` can be implemented inline as:

```python
import secrets

def _new_comment_id() -> str:
    return "c_" + secrets.token_urlsafe(9)[:12]
```

- [ ] **Step 4: Implement `cmd_comment_add` in `task.py`**

In `<eps>/scripts/task.py`, locate the area where other `cmd_*` functions are defined (around line 247–346) and add:

```python
def cmd_comment_add(args: argparse.Namespace) -> None:
    from explore_persona_space import task_workflow

    comment = task_workflow.append_comment(
        task_n=args.number,
        author=args.author,
        body_md=args.body_md,
        thread_id=args.thread_id,
        reply_to=args.reply_to,
        source=args.source,
    )
    print(json.dumps(comment, ensure_ascii=False))
```

In `main()` (around line 449+), register the subparser. Insert near the other parser registrations:

```python
p = sub.add_parser("comment-add", help="append a comment to tasks/<status>/<N>/comments.jsonl")
p.add_argument("number", type=int)
p.add_argument("--author", required=True, choices=["user", "claude", "codex"])
p.add_argument("--body-md", dest="body_md", required=True)
p.add_argument("--thread-id", dest="thread_id", default=None)
p.add_argument("--reply-to", dest="reply_to", default=None)
p.add_argument("--source", default=None,
               help="audit-log source, e.g. 'sagan-user:<session-id>' or 'cli'")
p.set_defaults(func=cmd_comment_add)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd <eps>
python -m pytest tests/test_task_comment_add.py -v
```
Expected: both tests PASS.

- [ ] **Step 6: Add `.gitignore` entry for orchestrator lockfiles**

In `<eps>/.gitignore`, append:

```
tasks/**/.orchestrator.pid
```

- [ ] **Step 7: Commit**

```bash
cd <eps>
git add scripts/task.py src/explore_persona_space/task_workflow.py tests/test_task_comment_add.py .gitignore
git commit -m "task.py: add comment-add subcommand; gitignore .orchestrator.pid"
```

### Task 1.2: Add `scripts/orchestrator_lock.py`

**Files:**
- Create: `<eps>/scripts/orchestrator_lock.py`
- Create: `<eps>/tests/test_orchestrator_lock.py`

- [ ] **Step 1: Write the failing test**

Create `<eps>/tests/test_orchestrator_lock.py`:

```python
import os
import subprocess
import sys
import time

def _lock_cmd(tmp_repo, *args):
    return subprocess.run(
        [sys.executable, "scripts/orchestrator_lock.py", *args],
        cwd=tmp_repo, capture_output=True, text=True,
    )

def test_acquire_when_unlocked_succeeds(tmp_repo, registered_task):
    r = _lock_cmd(tmp_repo, "acquire", str(registered_task))
    assert r.returncode == 0, r.stderr
    assert "acquired" in r.stdout

def test_acquire_when_locked_by_live_pid_fails(tmp_repo, registered_task):
    # Acquire as current process
    _lock_cmd(tmp_repo, "acquire", str(registered_task))
    # Try to acquire again (this process is still alive, so the previous
    # PID file points at us — should refuse).
    r = _lock_cmd(tmp_repo, "acquire", str(registered_task))
    assert r.returncode == 1
    assert "locked" in r.stderr.lower()

def test_acquire_when_locked_by_dead_pid_succeeds(tmp_repo, registered_task, monkeypatch):
    # Write a stale PID file
    from pathlib import Path
    folder = next((tmp_repo / "tasks").glob(f"*/{registered_task}"))
    (folder / ".orchestrator.pid").write_text("999999\n2026-01-01T00:00:00\n")
    r = _lock_cmd(tmp_repo, "acquire", str(registered_task))
    assert r.returncode == 0, r.stderr
    assert "reclaimed" in r.stdout

def test_status_shows_current_owner(tmp_repo, registered_task):
    _lock_cmd(tmp_repo, "acquire", str(registered_task))
    r = _lock_cmd(tmp_repo, "status", str(registered_task))
    assert "active" in r.stdout
    assert f"pid={os.getpid()}" not in r.stdout  # subprocess has different PID

def test_release_drops_lock(tmp_repo, registered_task):
    _lock_cmd(tmp_repo, "acquire", str(registered_task))
    r = _lock_cmd(tmp_repo, "release", str(registered_task))
    assert r.returncode == 0
    # Re-acquire should succeed
    r2 = _lock_cmd(tmp_repo, "acquire", str(registered_task))
    assert r2.returncode == 0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd <eps>
python -m pytest tests/test_orchestrator_lock.py -v
```
Expected: all tests fail (file does not exist).

- [ ] **Step 3: Implement `scripts/orchestrator_lock.py`**

Create `<eps>/scripts/orchestrator_lock.py`:

```python
#!/usr/bin/env python3
"""Per-task orchestrator lockfile management.

Each EPS task can have at most one `claude` CLI subprocess (a "body")
acting on it at any time. The lockfile is `tasks/<status>/<N>/.orchestrator.pid`
written at body start and deleted on clean exit. If a body crashes, the
next attempt detects the stale PID (no live process) and reclaims.

Subcommands: acquire | release | status
"""

from __future__ import annotations

import argparse
import os
import signal
import sys
from datetime import datetime, timezone
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_REPO_ROOT = _HERE.parent
sys.path.insert(0, str(_REPO_ROOT / "src"))

from explore_persona_space.task_workflow import find_task_folder  # noqa: E402


def _is_alive(pid: int) -> bool:
    """Return True if the given PID is currently a live process."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        # Process exists but we don't own it — still "alive".
        return True
    return True


def _lock_path(task_n: int) -> Path:
    return find_task_folder(task_n) / ".orchestrator.pid"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def cmd_acquire(args: argparse.Namespace) -> int:
    lock = _lock_path(args.number)
    if lock.exists():
        try:
            content = lock.read_text().strip().splitlines()
            owner_pid = int(content[0])
        except (ValueError, IndexError):
            owner_pid = -1
        if owner_pid > 0 and _is_alive(owner_pid):
            print(f"locked by pid={owner_pid}", file=sys.stderr)
            return 1
        # Stale — reclaim.
        lock.write_text(f"{os.getpid()}\n{_now()}\n")
        print(f"reclaimed (was pid={owner_pid})")
        return 0
    lock.write_text(f"{os.getpid()}\n{_now()}\n")
    print(f"acquired pid={os.getpid()}")
    return 0


def cmd_release(args: argparse.Namespace) -> int:
    lock = _lock_path(args.number)
    if not lock.exists():
        print("not locked", file=sys.stderr)
        return 0
    try:
        owner_pid = int(lock.read_text().strip().splitlines()[0])
    except (ValueError, IndexError):
        owner_pid = -1
    if owner_pid != os.getpid() and not args.force:
        print(f"refusing to release lock owned by pid={owner_pid}", file=sys.stderr)
        return 1
    lock.unlink()
    print("released")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    lock = _lock_path(args.number)
    if not lock.exists():
        print("inactive")
        return 0
    content = lock.read_text().strip().splitlines()
    try:
        owner_pid = int(content[0])
        since = content[1] if len(content) > 1 else "?"
    except (ValueError, IndexError):
        print("corrupt")
        return 0
    alive = _is_alive(owner_pid)
    state = "active" if alive else "stale"
    print(f"{state} pid={owner_pid} since={since}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    for name, fn, helps in (
        ("acquire", cmd_acquire, "claim the task lock (refuse if live owner)"),
        ("release", cmd_release, "release a lock owned by this PID"),
        ("status", cmd_status, "show current owner / alive / stale / inactive"),
    ):
        p = sub.add_parser(name, help=helps)
        p.add_argument("number", type=int)
        if name == "release":
            p.add_argument("--force", action="store_true",
                           help="release even if a different PID owns the lock")
        p.set_defaults(func=fn)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
```

Make it executable: `chmod +x <eps>/scripts/orchestrator_lock.py`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd <eps>
python -m pytest tests/test_orchestrator_lock.py -v
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd <eps>
git add scripts/orchestrator_lock.py tests/test_orchestrator_lock.py
git commit -m "orchestrator_lock.py: per-task PID-file lock for /issue bodies"
```

### Task 1.3: Wire the lockfile into the `/issue` skill

**Files:**
- Modify: `<eps>/.claude/skills/issue/SKILL.md` (path may differ — find the actual SKILL.md for `/issue`)

This task is descriptive rather than test-driven because SKILL.md is read by Claude at execution time, not unit-tested.

- [ ] **Step 1: Locate the `/issue` skill file**

```bash
find /home/thomasjiralerspong/explore-persona-space/.claude/skills -name SKILL.md | xargs grep -l "/issue" 2>/dev/null
```
Expected: at least one path. Use the one whose frontmatter says it's the `/issue` skill.

- [ ] **Step 2: Read the current SKILL.md to find the Step 0 / entry section and all exit points**

```bash
sed -n '1,60p' <path-to-SKILL.md>
```
Look for the "Step 0" / "before doing anything" section. Note every place the skill exits (search for `exit`, `STOP`, `END`, `RETURN TO USER`).

- [ ] **Step 3: Insert lock acquire at the entry**

At the top of the skill body (before Step 0 or as part of it), insert:

```markdown
## Step −1: Acquire orchestrator lock

Before doing anything else, run:

```bash
python scripts/orchestrator_lock.py acquire <N>
```

If this exits non-zero with "locked by pid=…", append a marker and exit:

```bash
python scripts/task.py post-event <N> epm:orchestrator-locked --note "another body alive"
exit 0
```

If it exits zero (acquired or reclaimed), continue to Step 0.
```

- [ ] **Step 4: Insert lock release at every clean exit**

At every documented exit point, before the final `exit` or `RETURN TO USER` line, insert:

```bash
python scripts/orchestrator_lock.py release <N>
```

For crash exits (uncaught error, SIGTERM), the next invocation will detect the stale PID and reclaim — no explicit release needed.

- [ ] **Step 5: Manual smoke test — spawn two concurrent /issue runs**

In one terminal:
```bash
cd <eps>
claude --print --input-format text --output-format stream-json --prompt "/issue 192" &
sleep 2
```

In another terminal:
```bash
cd <eps>
claude --print --input-format text --output-format stream-json --prompt "/issue 192"
```

Expected: the second one posts an `epm:orchestrator-locked` marker and exits within seconds. The first runs normally.

Then check the events log:
```bash
python <eps>/scripts/task.py list-markers 192 --prefix epm:orchestrator-locked
```
Expected: one `epm:orchestrator-locked` line from the second invocation.

- [ ] **Step 6: Commit**

```bash
cd <eps>
git add .claude/skills/issue/SKILL.md  # adjust path
git commit -m "issue skill: acquire orchestrator lock at entry; release at exits"
```

### Task 1.4: Add `--source` flag to `task.py promote` and other mutating subcommands

**Files:**
- Modify: `<eps>/scripts/task.py` — add `--source` to `set-status`, `post-event`, `promote`, `set-body`, `set-title`, `set-clean-result`, `add-tag`, `remove-tag`, `new-plan-version`.
- Modify: `<eps>/src/explore_persona_space/task_workflow.py` — accept `source` parameter on the underlying writers and persist it in the event/marker payload.
- Modify: `<eps>/.claude/workflow.yaml` — allow `source=sagan-user:*` on `awaiting_promotion` gate.
- Create: `<eps>/tests/test_task_source_flag.py`

- [ ] **Step 1: Write the failing test**

```python
import json
import subprocess
import sys

def test_set_status_records_source(tmp_repo, registered_task):
    subprocess.run(
        [sys.executable, "scripts/task.py", "set-status",
         str(registered_task), "approved",
         "--source=sagan-user:sess-abc"],
        cwd=tmp_repo, capture_output=True, text=True, check=True,
    )
    r = subprocess.run(
        [sys.executable, "scripts/task.py", "list-markers",
         str(registered_task), "--json"],
        cwd=tmp_repo, capture_output=True, text=True, check=True,
    )
    events = [json.loads(line) for line in r.stdout.strip().split("\n")]
    last = events[-1]
    assert last.get("source") == "sagan-user:sess-abc"

def test_promote_refuses_without_sagan_user_or_cli_source(tmp_repo, awaiting_promotion_task):
    # No --source → reject (preserves USER-ONLY invariant)
    r = subprocess.run(
        [sys.executable, "scripts/task.py", "promote",
         str(awaiting_promotion_task), "useful"],
        cwd=tmp_repo, capture_output=True, text=True,
    )
    assert r.returncode != 0
    assert "USER-ONLY" in r.stderr or "source required" in r.stderr.lower()

def test_promote_accepts_sagan_user_source(tmp_repo, awaiting_promotion_task):
    r = subprocess.run(
        [sys.executable, "scripts/task.py", "promote",
         str(awaiting_promotion_task), "useful",
         "--source=sagan-user:sess-abc"],
        cwd=tmp_repo, capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stderr

def test_promote_rejects_agent_source(tmp_repo, awaiting_promotion_task):
    r = subprocess.run(
        [sys.executable, "scripts/task.py", "promote",
         str(awaiting_promotion_task), "useful",
         "--source=agent:experimenter"],
        cwd=tmp_repo, capture_output=True, text=True,
    )
    assert r.returncode != 0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd <eps>
python -m pytest tests/test_task_source_flag.py -v
```
Expected: all fail.

- [ ] **Step 3: Add `--source` to subparsers in `task.py`**

For each of `set-status`, `post-event`, `set-body`, `set-title`, `set-clean-result`, `add-tag`, `remove-tag`, `new-plan-version`, `promote`, add this line in their subparser definition (locate by `sub.add_parser("<name>"`):

```python
p.add_argument("--source", default=None,
               help="audit-log source, e.g. 'sagan-user:<session-id>', 'cli', 'agent:<name>'")
```

- [ ] **Step 4: Thread `source` through to `cmd_*` functions and into `task_workflow`**

For each `cmd_<name>`, pass `source=args.source` into the corresponding `task_workflow` call. In `task_workflow.py`, accept `source` as a keyword arg on each writer and include it in the event payload, e.g.:

```python
def set_status(*, task_n: int, new_status: str, source: str | None = None) -> None:
    ...
    _append_event(task_n, {
        "kind": "epm:status-changed",
        "from": old_status,
        "to": new_status,
        "source": source,
        "at": _now_iso(),
    })
    ...
```

- [ ] **Step 5: Add the promote-source gate in `cmd_promote`**

In `task.py`:

```python
def cmd_promote(args: argparse.Namespace) -> None:
    from explore_persona_space import task_workflow

    source = args.source
    if source is None:
        # Allow only if attached to a TTY (i.e. a human ran it interactively).
        if not sys.stdin.isatty():
            print("promote is USER-ONLY: pass --source=sagan-user:<id> or run from a tty",
                  file=sys.stderr)
            sys.exit(2)
        source = "cli"
    elif not (source == "cli" or source.startswith("sagan-user:")):
        print(f"promote refuses source={source!r}: only 'cli' or 'sagan-user:*' allowed",
              file=sys.stderr)
        sys.exit(2)

    task_workflow.promote(
        task_n=args.number,
        verdict=args.verdict,
        source=source,
    )
```

- [ ] **Step 6: Update `.claude/workflow.yaml` for the awaiting_promotion gate**

Locate the `awaiting_promotion` gate definition. Add a `valid_sources` block:

```yaml
# inside the awaiting_promotion gate definition
valid_sources:
  - "cli"          # interactive terminal invocation
  - "sagan-user:*" # human action through Sagan dashboard
# Agent / automated sources are explicitly rejected.
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd <eps>
python -m pytest tests/test_task_source_flag.py -v
```
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
cd <eps>
git add scripts/task.py src/explore_persona_space/task_workflow.py .claude/workflow.yaml tests/test_task_source_flag.py
git commit -m "task.py: add --source audit flag; gate promote on sagan-user|cli"
```

### Task 1.5: Document the callable API in `tasks/CALLABLE_API.md`

**Files:**
- Create: `<eps>/tasks/CALLABLE_API.md`

This is a pure-documentation task; no tests.

- [ ] **Step 1: Create the doc**

```markdown
# task.py callable API (for Sagan dashboard)

This file documents the `scripts/task.py` subcommands that Sagan's
runner shells out to. All mutations go through `task.py` so the
flock + git-commit single-writer discipline is preserved.

## Convention

- Every subcommand that mutates state takes `--source=<scheme>:<id>`.
  Sagan passes `sagan-user:<sessions.id>`.
- Every subcommand returns JSON on stdout when invoked with `--json`
  (some always do).
- Non-zero exit means the operation refused; stderr explains why.

## Subcommands Sagan calls

| Subcommand | Purpose | Sagan callers |
| --- | --- | --- |
| `view N --json` | Snapshot of task state for the mirror cache | `eps-mirror` job |
| `latest-marker N` | Last event on the task | mirror reconciler |
| `list-markers N --json` | All events on the task | task detail timeline |
| `list-by-status --json` | Board population | initial mirror seed |
| `set-status N <status> --source=…` | Advance / regress status | approve, block, unblock |
| `comment-add N --author=… --body-md=… --source=…` | Append a comment | comment composer |
| `promote N <verdict> --source=sagan-user:…` | Promote awaiting_promotion → completed | Promote button |
| `post-event N <kind> --source=…` | Post a marker (e.g. epm:paused-via-sagan) | Pause button |

## NOT called from Sagan

- `migrate-body` — one-off maintenance.
- `audit` — diagnostic only.
- `new`, `set-body`, `set-title`, `set-clean-result`, `add-tag`, `remove-tag`, `new-plan-version` — agent-side writes only; humans use the dashboard composer instead.

## Source-string conventions

- `cli` — interactive terminal invocation (default when stdin is a tty).
- `sagan-user:<sessions.id>` — human action through Sagan dashboard.
- `agent:<agent-name>` — agent-side automated write.

`promote` accepts only `cli` and `sagan-user:*`.
```

- [ ] **Step 2: Commit**

```bash
cd <eps>
git add tasks/CALLABLE_API.md
git commit -m "tasks/CALLABLE_API.md: document task.py subcommands Sagan shells out to"
```

---

## Phase 2 — Sagan-side plumbing

All Sagan phase-2 work happens in `/home/thomasjiralerspong/sagan/.claude/worktrees/sagan-control-surface`. Replace `<sagan>` with that path.

### Task 2.1: Configure `SAGAN_CLIENT_REPOS` and EPS env vars

**Files:**
- Modify: `<sagan>/.env` — add EPS mapping (DO NOT commit `.env`; it's gitignored).
- Modify: `<sagan>/.env.example` — add documented examples.

- [ ] **Step 1: Add lines to `.env`**

```bash
echo 'SAGAN_CLIENT_REPOS={"eps":"/home/thomasjiralerspong/explore-persona-space"}' >> <sagan>/.env
echo 'EPS_TASK_PY=/home/thomasjiralerspong/explore-persona-space/scripts/task.py' >> <sagan>/.env
echo 'EPS_TASKS_DIR=/home/thomasjiralerspong/explore-persona-space/tasks' >> <sagan>/.env
echo 'EPS_WORKFLOW_YAML=/home/thomasjiralerspong/explore-persona-space/.claude/workflow.yaml' >> <sagan>/.env
```

- [ ] **Step 2: Document in `.env.example`**

Append to `<sagan>/.env.example`:

```bash
# EPS client repo integration (Sagan-as-EPS-dashboard)
SAGAN_CLIENT_REPOS={"eps":"/path/to/explore-persona-space"}
EPS_TASK_PY=/path/to/explore-persona-space/scripts/task.py
EPS_TASKS_DIR=/path/to/explore-persona-space/tasks
EPS_WORKFLOW_YAML=/path/to/explore-persona-space/.claude/workflow.yaml
```

- [ ] **Step 3: Commit**

```bash
cd <sagan>
git add .env.example
git commit -m "env: document EPS client-repo integration vars"
```

### Task 2.2: Drizzle schema for `agent_runs.eps_task_n` and `eps_task_mirror`

**Files:**
- Modify: `<sagan>/packages/db/src/schema/agent-runs.ts` (or wherever `agentRuns` table is — locate with `grep -r 'agent_runs' <sagan>/packages/db/src/schema/`).
- Create: `<sagan>/packages/db/src/schema/eps-task-mirror.ts`
- Modify: `<sagan>/packages/db/src/schema/index.ts` — re-export.
- Generate: `<sagan>/packages/db/drizzle/000X_<auto>.sql` via `pnpm --filter @sagan/db db:generate`.

- [ ] **Step 1: Add `epsTaskN` to `agent_runs` schema**

Locate the existing `agentRuns` pgTable definition. Add a column:

```ts
import { integer, index } from 'drizzle-orm/pg-core';

export const agentRuns = pgTable('agent_runs', {
  // … existing columns …
  epsTaskN: integer('eps_task_n'),  // nullable; set on kind='eps_orchestrator' or 'eps_qa'
  // … existing columns …
}, (table) => ({
  // … existing indexes …
  epsTaskNIdx: index('agent_runs_eps_task_n_idx').on(table.epsTaskN),
}));
```

- [ ] **Step 2: Create `eps-task-mirror.ts`**

```ts
import { pgTable, integer, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Read-only projection of EPS task state into Sagan DB.
 * Populated by services/runner/src/jobs/eps-mirror.ts via chokidar fs-watch.
 * EPS local files remain canonical; this table is a cache for the dashboard.
 */
export const epsTaskMirror = pgTable('eps_task_mirror', {
  number: integer('number').primaryKey(),
  status: text('status').notNull(),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  hasCleanResult: boolean('has_clean_result').notNull().default(false),
  latestMarkerKind: text('latest_marker_kind'),
  latestMarkerAt: timestamp('latest_marker_at', { withTimezone: true }),
  bodyMd: text('body_md'),
  currentPlanMd: text('current_plan_md'),
  blockers: jsonb('blockers').$type<Array<{ reason: string; at: string }>>(),
  commentsSummary: jsonb('comments_summary').$type<Array<{
    id: string; author: 'user' | 'claude' | 'codex'; body_md: string; created_at: string;
  }>>(),
  eventsTail: jsonb('events_tail').$type<Array<{
    kind: string; note?: string; source?: string; at: string;
  }>>(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull().default(sql`now()`),
}, (table) => ({
  statusIdx: index('eps_task_mirror_status_idx').on(table.status, table.updatedAt),
}));
```

- [ ] **Step 3: Re-export from schema index**

In `<sagan>/packages/db/src/schema/index.ts`, add:

```ts
export * from './eps-task-mirror';
```

- [ ] **Step 4: Generate migration**

```bash
cd <sagan>
pnpm --filter @sagan/db db:generate
```
Expected: a new file at `packages/db/drizzle/000X_<random_name>.sql` containing `CREATE TABLE eps_task_mirror` and `ALTER TABLE agent_runs ADD COLUMN eps_task_n integer`.

- [ ] **Step 5: Apply migration to local DB**

```bash
cd <sagan>
pnpm --filter @sagan/db db:migrate
```
Expected: migration applies cleanly. If errors, inspect the generated SQL and fix the schema TS.

- [ ] **Step 6: Verify with a quick query**

```bash
cd <sagan>
psql "$DATABASE_URL_DIRECT" -c "\\d eps_task_mirror"
```
Expected: shows the new table with all columns.

- [ ] **Step 7: Commit**

```bash
cd <sagan>
git add packages/db/src/schema/eps-task-mirror.ts packages/db/src/schema/agent-runs.ts packages/db/src/schema/index.ts packages/db/drizzle/
git commit -m "db: eps_task_mirror table + agent_runs.eps_task_n column"
```

### Task 2.3: Vendor `workflow.yaml` and write the TS parser

**Files:**
- Create: `<sagan>/packages/workflow/package.json`
- Create: `<sagan>/packages/workflow/workflow.yaml` (copy of EPS's)
- Create: `<sagan>/packages/workflow/src/index.ts`
- Create: `<sagan>/packages/workflow/src/index.test.ts`
- Create: `<sagan>/packages/workflow/tsconfig.json`
- Modify: `<sagan>/pnpm-workspace.yaml` already includes `packages/*` so no change needed.

- [ ] **Step 1: Create the package skeleton**

`<sagan>/packages/workflow/package.json`:

```json
{
  "name": "@sagan/workflow",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "yaml": "^2.5.0"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.4"
  }
}
```

`<sagan>/packages/workflow/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Copy workflow.yaml from EPS**

```bash
cp /home/thomasjiralerspong/explore-persona-space/.claude/workflow.yaml \
   <sagan>/packages/workflow/workflow.yaml
```

- [ ] **Step 3: Write the failing test**

`<sagan>/packages/workflow/src/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadWorkflow, allowedTransition, gateValidSources } from './index';

describe('loadWorkflow', () => {
  it('parses statuses, columns, markerKinds, gates from the vendored yaml', () => {
    const wf = loadWorkflow();
    expect(wf.version).toBeGreaterThan(0);
    expect(wf.statuses.length).toBeGreaterThan(10);
    expect(wf.statuses.find((s) => s.name === 'awaiting_promotion')).toBeDefined();
    expect(wf.columns.find((c) => c.name === 'In flight')).toBeDefined();
    expect(wf.markerKinds).toContain('epm:plan');
  });
});

describe('allowedTransition', () => {
  it('rejects invalid transitions', () => {
    expect(allowedTransition('proposed', 'completed')).toBe(false);
  });
  it('accepts plan_pending -> approved', () => {
    expect(allowedTransition('plan_pending', 'approved')).toBe(true);
  });
});

describe('gateValidSources', () => {
  it('awaiting_promotion accepts sagan-user:* and cli', () => {
    const sources = gateValidSources('awaiting_promotion');
    expect(sources).toContain('cli');
    expect(sources).toContain('sagan-user:*');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd <sagan>
pnpm --filter @sagan/workflow test
```
Expected: fails — `loadWorkflow` not defined.

- [ ] **Step 5: Implement the parser**

`<sagan>/packages/workflow/src/index.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export interface Workflow {
  version: number;
  name: string;
  statuses: Array<{ name: string; column: string }>;
  columns: Array<{ name: string; color: string; description: string }>;
  markerKinds: string[];
  gates: Array<{
    id: number; name: string; kind: 'inline' | 'park_and_wait';
    valid_sources?: string[];
  }>;
  transitions: Array<{ from: string; to: string }>;
}

let cached: Workflow | null = null;

export function loadWorkflow(path?: string): Workflow {
  if (cached && !path) return cached;
  const resolved = path
    ?? process.env.EPS_WORKFLOW_YAML
    ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'workflow.yaml');
  const text = readFileSync(resolved, 'utf-8');
  const raw = parseYaml(text);
  const wf: Workflow = {
    version: raw.version,
    name: raw.name,
    statuses: (raw.statuses ?? []).map((s: any) => ({ name: s.name, column: s.column })),
    columns: raw.columns ?? [],
    markerKinds: (raw.markers ?? raw.marker_kinds ?? []).map((m: any) =>
      typeof m === 'string' ? m : m.kind),
    gates: (raw.gates ?? []).map((g: any) => ({
      id: g.id, name: g.name, kind: g.kind,
      valid_sources: g.valid_sources,
    })),
    transitions: raw.transitions ?? [],
  };
  if (!path) cached = wf;
  return wf;
}

export function allowedTransition(from: string, to: string): boolean {
  const wf = loadWorkflow();
  return wf.transitions.some((t) => t.from === from && t.to === to);
}

export function gateValidSources(statusName: string): string[] {
  const wf = loadWorkflow();
  const gate = wf.gates.find((g) => g.name === statusName);
  return gate?.valid_sources ?? [];
}

export function columnsForStatus(statusName: string): string {
  const wf = loadWorkflow();
  return wf.statuses.find((s) => s.name === statusName)?.column ?? 'Unknown';
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd <sagan>
pnpm --filter @sagan/workflow test
```
Expected: all tests PASS. If `transitions` isn't a top-level key in the real workflow.yaml, adjust the parser to read whatever the actual structure is (use `pnpm --filter @sagan/workflow test --inspect` or `console.log(raw)` to discover the shape, then iterate).

- [ ] **Step 7: Commit**

```bash
cd <sagan>
git add packages/workflow/
git commit -m "packages/workflow: vendor EPS workflow.yaml + TS parser"
```

### Task 2.4: `spawnIssueRun(taskN)` helper

**Files:**
- Create: `<sagan>/services/runner/src/lib/eps-orchestrator.ts`
- Create: `<sagan>/services/runner/src/lib/eps-orchestrator.test.ts`
- Modify: `<sagan>/services/runner/src/session.ts` — accept `'eps_orchestrator'` and `'eps_qa'` in the `kind` union and route to the correct prompt.

- [ ] **Step 1: Write the failing test**

`<sagan>/services/runner/src/lib/eps-orchestrator.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveEpsRepoPath, buildIssuePrompt } from './eps-orchestrator';

describe('resolveEpsRepoPath', () => {
  beforeEach(() => {
    process.env.SAGAN_CLIENT_REPOS = JSON.stringify({
      eps: '/abs/path/to/eps',
    });
  });

  it('returns the eps repo path from SAGAN_CLIENT_REPOS', () => {
    expect(resolveEpsRepoPath()).toBe('/abs/path/to/eps');
  });

  it('throws if eps slug is missing', () => {
    process.env.SAGAN_CLIENT_REPOS = JSON.stringify({});
    expect(() => resolveEpsRepoPath()).toThrow(/eps/);
  });
});

describe('buildIssuePrompt', () => {
  it('produces the canonical /issue N prompt', () => {
    expect(buildIssuePrompt(192)).toBe('/issue 192');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd <sagan>
pnpm --filter @sagan/runner test  # add vitest if not present
```
Expected: fails because file doesn't exist. If vitest isn't configured for the runner package, add `"test": "vitest run"` to `services/runner/package.json` scripts and add vitest to devDependencies.

- [ ] **Step 3: Implement `eps-orchestrator.ts`**

```ts
import { db, schema } from '@sagan/db';
import { sql } from 'drizzle-orm';
import { runWithStreaming } from '../session';

export function resolveEpsRepoPath(): string {
  const raw = process.env.SAGAN_CLIENT_REPOS;
  if (!raw) throw new Error('SAGAN_CLIENT_REPOS not set');
  const map = JSON.parse(raw) as Record<string, string>;
  const path = map.eps;
  if (!path) throw new Error('SAGAN_CLIENT_REPOS missing "eps" slug');
  return path;
}

export function buildIssuePrompt(taskN: number): string {
  return `/issue ${taskN}`;
}

export interface SpawnIssueRunOpts {
  taskN: number;
  triggeredBy: 'sagan-user' | 'auto-respawn' | 'wakeup';
  sagaUserSessionId?: string;  // when triggeredBy === 'sagan-user'
}

/** Spawn a fresh claude CLI subprocess that runs `/issue N` in EPS. */
export async function spawnIssueRun(opts: SpawnIssueRunOpts): Promise<string> {
  const epsPath = resolveEpsRepoPath();
  const prompt = buildIssuePrompt(opts.taskN);

  const [run] = await db().insert(schema.agentRuns).values({
    kind: 'eps_orchestrator',
    status: 'queued',
    epsTaskN: opts.taskN,
    request: {
      triggeredBy: opts.triggeredBy,
      saganUserSessionId: opts.sagaUserSessionId,
    },
    cwd: epsPath,
  }).returning({ id: schema.agentRuns.id });

  // Hand off to the existing supervisor; runWithStreaming respects row.cwd.
  await runWithStreaming(run.id, {
    id: run.id,
    kind: 'eps_orchestrator',
    cwd: epsPath,
  } as any, prompt, {
    /* options */
  });

  return run.id;
}
```

If `runWithStreaming` doesn't currently accept `cwd` on the row, the modification in step 4 fixes that.

- [ ] **Step 4: Extend `session.ts` to accept the new kinds and `cwd`**

In `<sagan>/services/runner/src/session.ts`:

(a) Add `'eps_orchestrator' | 'eps_qa'` to the `kind` union types referenced (the existing union is somewhere near top — locate via `grep -n "kind:" services/runner/src/session.ts`).

(b) In the spawn call site (the `claude --print …` invocation around line 84), ensure `cwd` is read from `row.cwd ?? env.RUNNER_REPO_ROOT`:

```ts
const cwd = row.cwd ?? env.RUNNER_REPO_ROOT;
// pass cwd in the spawn options
```

(c) Skip Sagan-specific tooling allow-lists for `eps_orchestrator` (it's running in EPS, will pick up EPS's own `.claude/` config). For `eps_qa`, allow only `Read`, `Glob`, `Grep`, `Bash` (no write tools).

- [ ] **Step 5: Run test**

```bash
cd <sagan>
pnpm --filter @sagan/runner test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd <sagan>
git add services/runner/src/lib/eps-orchestrator.ts services/runner/src/lib/eps-orchestrator.test.ts services/runner/src/session.ts
git commit -m "runner: spawnIssueRun helper + eps_orchestrator/eps_qa kinds"
```

### Task 2.5: `eps-mirror` chokidar fs-watch job

**Files:**
- Create: `<sagan>/services/runner/src/jobs/eps-mirror.ts`
- Create: `<sagan>/services/runner/src/jobs/eps-mirror.test.ts` (integration test using a tmp tasks/ tree)
- Modify: `<sagan>/services/runner/package.json` — add `chokidar` dep.
- Modify: `<sagan>/services/runner/src/index.ts` — start the eps-mirror job on boot.

- [ ] **Step 1: Add `chokidar` dependency**

```bash
cd <sagan>
pnpm --filter @sagan/runner add chokidar
```

- [ ] **Step 2: Write the integration test**

`<sagan>/services/runner/src/jobs/eps-mirror.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startEpsMirror, refreshTaskMirror, _resetMirrorTable } from './eps-mirror';
import { db, schema } from '@sagan/db';
import { eq } from 'drizzle-orm';

let tasksDir: string;

beforeAll(async () => {
  tasksDir = mkdtempSync(join(tmpdir(), 'eps-mirror-'));
  mkdirSync(join(tasksDir, 'proposed', '999'), { recursive: true });
  writeFileSync(join(tasksDir, 'proposed', '999', 'body.md'),
    '---\ntitle: Test task\nkind: experiment\nhas_clean_result: false\n---\n# body');
  writeFileSync(join(tasksDir, 'proposed', '999', 'events.jsonl'),
    JSON.stringify({ kind: 'epm:created', at: '2026-05-20T00:00:00Z' }) + '\n');
  writeFileSync(join(tasksDir, 'REGISTRY.json'),
    JSON.stringify({ highest_id: 999, tasks: {
      "999": { kind: 'experiment', path: 'tasks/proposed/999',
               status: 'proposed', title: 'Test task', has_clean_result: false },
    }}));
  process.env.EPS_TASKS_DIR = tasksDir;
  await _resetMirrorTable();
});

afterAll(() => {
  rmSync(tasksDir, { recursive: true, force: true });
});

describe('refreshTaskMirror', () => {
  it('upserts a row from REGISTRY + body.md + events.jsonl', async () => {
    await refreshTaskMirror(999);
    const rows = await db().select().from(schema.epsTaskMirror)
      .where(eq(schema.epsTaskMirror.number, 999));
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('Test task');
    expect(rows[0].status).toBe('proposed');
    expect(rows[0].latestMarkerKind).toBe('epm:created');
  });

  it('reflects a status transition (folder rename)', async () => {
    renameSync(join(tasksDir, 'proposed', '999'),
               join(tasksDir, 'planning', '999'));
    // Update REGISTRY accordingly
    writeFileSync(join(tasksDir, 'REGISTRY.json'),
      JSON.stringify({ highest_id: 999, tasks: {
        "999": { kind: 'experiment', path: 'tasks/planning/999',
                 status: 'planning', title: 'Test task', has_clean_result: false },
      }}));
    await refreshTaskMirror(999);
    const [row] = await db().select().from(schema.epsTaskMirror)
      .where(eq(schema.epsTaskMirror.number, 999));
    expect(row.status).toBe('planning');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd <sagan>
pnpm --filter @sagan/runner test src/jobs/eps-mirror.test.ts
```
Expected: fails — module doesn't exist.

- [ ] **Step 4: Implement `eps-mirror.ts`**

```ts
import { db, schema } from '@sagan/db';
import { sql, eq } from 'drizzle-orm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const execFileP = promisify(execFile);

function epsTasksDir(): string {
  const dir = process.env.EPS_TASKS_DIR;
  if (!dir) throw new Error('EPS_TASKS_DIR not set');
  return dir;
}
function epsTaskPy(): string {
  return process.env.EPS_TASK_PY
    ?? join(epsTasksDir(), '..', 'scripts', 'task.py');
}

interface RegistryEntry {
  kind: string;
  path: string;
  status: string;
  title: string;
  has_clean_result: boolean;
}

function readRegistry(): Record<string, RegistryEntry> {
  const raw = readFileSync(join(epsTasksDir(), 'REGISTRY.json'), 'utf-8');
  return JSON.parse(raw).tasks;
}

function parseTaskNumberFromPath(path: string): number | null {
  // path like ".../tasks/proposed/192/events.jsonl"
  const m = path.match(/\/tasks\/[^/]+\/(\d+)(\/|$)/);
  return m ? parseInt(m[1], 10) : null;
}

export async function refreshTaskMirror(taskN: number): Promise<void> {
  const { stdout } = await execFileP('python', [epsTaskPy(), 'view', String(taskN), '--json']);
  const view = JSON.parse(stdout);
  // view is expected to include: status, title, kind, has_clean_result, body_md,
  // events_tail, comments_tail, current_plan_md, blockers.
  // If `view --json` doesn't return all of these today, fall back to reading
  // files directly (body.md, events.jsonl, comments.jsonl, plans/plan.md).

  const folder = join(epsTasksDir(), '..', view.path); // path relative to repo root
  const eventsPath = join(folder, 'events.jsonl');
  const commentsPath = join(folder, 'comments.jsonl');
  const planPath = join(folder, 'plans', 'plan.md');

  const events = existsSync(eventsPath)
    ? readFileSync(eventsPath, 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
    : [];
  const comments = existsSync(commentsPath)
    ? readFileSync(commentsPath, 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
    : [];
  const currentPlanMd = existsSync(planPath) ? readFileSync(planPath, 'utf-8') : null;
  const lastEvent = events[events.length - 1];

  await db().insert(schema.epsTaskMirror).values({
    number: taskN,
    status: view.status,
    title: view.title,
    kind: view.kind,
    hasCleanResult: !!view.has_clean_result,
    latestMarkerKind: lastEvent?.kind ?? null,
    latestMarkerAt: lastEvent?.at ? new Date(lastEvent.at) : null,
    bodyMd: view.body_md ?? null,
    currentPlanMd,
    blockers: view.blockers ?? null,
    commentsSummary: comments.slice(-20),
    eventsTail: events.slice(-50),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: schema.epsTaskMirror.number,
    set: {
      status: sql`excluded.status`,
      title: sql`excluded.title`,
      kind: sql`excluded.kind`,
      hasCleanResult: sql`excluded.has_clean_result`,
      latestMarkerKind: sql`excluded.latest_marker_kind`,
      latestMarkerAt: sql`excluded.latest_marker_at`,
      bodyMd: sql`excluded.body_md`,
      currentPlanMd: sql`excluded.current_plan_md`,
      blockers: sql`excluded.blockers`,
      commentsSummary: sql`excluded.comments_summary`,
      eventsTail: sql`excluded.events_tail`,
      updatedAt: sql`now()`,
    },
  });

  await db().execute(sql`SELECT pg_notify('eps_task_mirror_updated', ${String(taskN)})`);
}

export async function reseed(): Promise<void> {
  const registry = readRegistry();
  await Promise.all(Object.keys(registry).map((n) => refreshTaskMirror(parseInt(n, 10))));
}

let watcher: FSWatcher | null = null;

export function startEpsMirror(): FSWatcher {
  if (watcher) return watcher;
  const dir = epsTasksDir();
  watcher = chokidar.watch(dir, {
    ignored: /(^|\/)\.(?!orchestrator\.pid$)/,  // ignore dotfiles except .orchestrator.pid
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    ignoreInitial: true,
  });
  watcher.on('all', async (event, path) => {
    if (path.endsWith('REGISTRY.json')) {
      await reseed();
      return;
    }
    const n = parseTaskNumberFromPath(path);
    if (n) {
      try { await refreshTaskMirror(n); }
      catch (e) { console.error(`eps-mirror: refresh failed for ${n}:`, e); }
    }
  });
  // Initial seed
  void reseed();
  // Hourly reconciliation (defensive against missed events).
  setInterval(() => { void reseed(); }, 60 * 60 * 1000);
  return watcher;
}

// Test helper
export async function _resetMirrorTable(): Promise<void> {
  await db().execute(sql`TRUNCATE TABLE eps_task_mirror`);
}
```

- [ ] **Step 5: Wire the job into runner startup**

In `<sagan>/services/runner/src/index.ts`, locate the boot section (likely registers other jobs). Add:

```ts
import { startEpsMirror } from './jobs/eps-mirror';

// … in the boot sequence …
if (process.env.EPS_TASKS_DIR) {
  startEpsMirror();
  console.log('[boot] eps-mirror started');
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd <sagan>
pnpm --filter @sagan/runner test src/jobs/eps-mirror.test.ts
```
Expected: PASS. If `task.py view --json` doesn't return everything the test expects, you may need to either (a) extend `task.py view` to include `body_md`, `comments_tail`, etc. in its JSON output (back to Task 1.5), or (b) read those files directly here. Choose (b) for simplicity — `body_md` and `events_tail` are already read directly in the implementation above; only `status`, `title`, `kind`, `has_clean_result`, `path` need to come from `view --json`.

- [ ] **Step 7: Commit**

```bash
cd <sagan>
git add services/runner/src/jobs/eps-mirror.ts services/runner/src/jobs/eps-mirror.test.ts services/runner/package.json services/runner/src/index.ts
git commit -m "runner: eps-mirror fs-watch job populating eps_task_mirror"
```

### Task 2.6: `eps-task-api.ts` server-side wrapper

**Files:**
- Create: `<sagan>/apps/web/src/lib/eps-task-api.ts`
- Create: `<sagan>/apps/web/src/lib/eps-task-api.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from './eps-task-api';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';

beforeEach(() => {
  vi.mocked(execFile).mockReset();
  process.env.EPS_TASK_PY = '/fake/task.py';
});

describe('approve', () => {
  it('shells out to task.py set-status with sagan-user source', async () => {
    vi.mocked(execFile).mockImplementation((cmd, args, cb: any) => {
      cb(null, JSON.stringify({ ok: true }), '');
      return {} as any;
    });
    await api.approve({ taskN: 192, fromStatus: 'plan_pending', saganSessionId: 'sess-abc' });
    expect(vi.mocked(execFile)).toHaveBeenCalledWith(
      'python', ['/fake/task.py', 'set-status', '192', 'approved',
                 '--source=sagan-user:sess-abc'],
      expect.any(Function),
    );
  });
});

describe('promote', () => {
  it('rejects when not from awaiting_promotion', async () => {
    await expect(api.promote({
      taskN: 192, fromStatus: 'running', verdict: 'useful', saganSessionId: 'sess-abc',
    })).rejects.toThrow(/awaiting_promotion/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd <sagan>
pnpm --filter @sagan/web test src/lib/eps-task-api.test.ts
```
Expected: fails.

- [ ] **Step 3: Implement `eps-task-api.ts`**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { allowedTransition } from '@sagan/workflow';

const execFileP = promisify(execFile);

function taskPy(): string {
  const p = process.env.EPS_TASK_PY;
  if (!p) throw new Error('EPS_TASK_PY not set');
  return p;
}

interface ApproveOpts {
  taskN: number; fromStatus: string;
  saganSessionId: string;
}
export async function approve(opts: ApproveOpts) {
  const nextStatus = nextStatusForApproval(opts.fromStatus);
  if (!nextStatus) throw new Error(`cannot approve from ${opts.fromStatus}`);
  return runTaskPy(
    'set-status', String(opts.taskN), nextStatus,
    `--source=sagan-user:${opts.saganSessionId}`,
  );
}

function nextStatusForApproval(from: string): string | null {
  if (from === 'plan_pending') return 'approved';
  // Add other approval-gated transitions here as we encounter them.
  return null;
}

interface BlockOpts {
  taskN: number; reason: string; saganSessionId: string;
}
export async function block(opts: BlockOpts) {
  // Post a marker first so the reason is captured, then change status.
  await runTaskPy('post-event', String(opts.taskN), 'epm:blocked',
    `--note=${opts.reason}`,
    `--source=sagan-user:${opts.saganSessionId}`);
  return runTaskPy('set-status', String(opts.taskN), 'blocked',
    `--source=sagan-user:${opts.saganSessionId}`);
}

interface UnblockOpts {
  taskN: number; prevStatus: string; saganSessionId: string;
}
export async function unblock(opts: UnblockOpts) {
  return runTaskPy('set-status', String(opts.taskN), opts.prevStatus,
    `--source=sagan-user:${opts.saganSessionId}`);
}

interface PromoteOpts {
  taskN: number; fromStatus: string;
  verdict: 'useful' | 'not-useful'; saganSessionId: string;
}
export async function promote(opts: PromoteOpts) {
  if (opts.fromStatus !== 'awaiting_promotion') {
    throw new Error(`promote requires status=awaiting_promotion, got ${opts.fromStatus}`);
  }
  return runTaskPy('promote', String(opts.taskN), opts.verdict,
    `--source=sagan-user:${opts.saganSessionId}`);
}

interface CommentOpts {
  taskN: number; author: 'user' | 'claude' | 'codex';
  bodyMd: string; replyTo?: string; saganSessionId: string;
}
export async function comment(opts: CommentOpts) {
  const args = [
    'comment-add', String(opts.taskN),
    `--author=${opts.author}`,
    `--body-md=${opts.bodyMd}`,
    `--source=sagan-user:${opts.saganSessionId}`,
  ];
  if (opts.replyTo) args.push(`--reply-to=${opts.replyTo}`);
  return runTaskPy(...args);
}

async function runTaskPy(...args: string[]): Promise<any> {
  const { stdout } = await execFileP('python', [taskPy(), ...args]);
  if (!stdout.trim()) return { ok: true };
  try { return JSON.parse(stdout); } catch { return { ok: true, stdout }; }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd <sagan>
pnpm --filter @sagan/web test src/lib/eps-task-api.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd <sagan>
git add apps/web/src/lib/eps-task-api.ts apps/web/src/lib/eps-task-api.test.ts
git commit -m "web: eps-task-api wrapper for shelling out to task.py"
```

---

## Phase 3 — Sagan dashboard surfaces

### Task 3.1: API routes for EPS task actions

**Files:**
- Create: `<sagan>/apps/web/app/api/eps-task/[number]/approve/route.ts`
- Create: `<sagan>/apps/web/app/api/eps-task/[number]/block/route.ts`
- Create: `<sagan>/apps/web/app/api/eps-task/[number]/unblock/route.ts`
- Create: `<sagan>/apps/web/app/api/eps-task/[number]/promote/route.ts`
- Create: `<sagan>/apps/web/app/api/eps-task/[number]/comment/route.ts`
- Create: `<sagan>/apps/web/app/api/eps-task/[number]/ask-claude/route.ts`
- Create: `<sagan>/apps/web/app/api/eps-task/[number]/pause/route.ts`
- Create: `<sagan>/apps/web/app/api/eps-task/[number]/restart/route.ts`
- Create: `<sagan>/apps/web/app/api/eps-task/[number]/start/route.ts`

- [ ] **Step 1: Create `approve/route.ts`** (template — others follow same shape)

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@sagan/auth';
import { z } from 'zod';
import * as eps from '@/lib/eps-task-api';
import { db, schema } from '@sagan/db';
import { eq } from 'drizzle-orm';
import { spawnIssueRun } from '@sagan/runner/lib/eps-orchestrator';

const Body = z.object({});

export async function POST(req: NextRequest, ctx: { params: { number: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const taskN = parseInt(ctx.params.number, 10);
  if (!Number.isFinite(taskN)) {
    return NextResponse.json({ error: 'bad task number' }, { status: 400 });
  }

  const [row] = await db().select({ status: schema.epsTaskMirror.status })
    .from(schema.epsTaskMirror).where(eq(schema.epsTaskMirror.number, taskN));
  if (!row) return NextResponse.json({ error: 'unknown task' }, { status: 404 });

  await eps.approve({ taskN, fromStatus: row.status, saganSessionId: session.id });
  // Spawn fresh /issue N to advance through the next steps.
  await spawnIssueRun({ taskN, triggeredBy: 'sagan-user', sagaUserSessionId: session.id });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create the other 8 routes following the same template**

For each, the difference is the call into `eps.*`:

| Route          | Body schema                      | eps call                                     | Spawn /issue after? |
| -------------- | -------------------------------- | -------------------------------------------- | ------------------- |
| `block`        | `{ reason: string }`             | `eps.block({ taskN, reason, …})`             | no                  |
| `unblock`      | `{ prevStatus: string }`         | `eps.unblock({ taskN, prevStatus, …})`       | yes                 |
| `promote`      | `{ verdict: 'useful' \| 'not-useful' }` | `eps.promote({ … fromStatus, verdict, …})` | yes                 |
| `comment`      | `{ body: string, replyTo?: string }` | `eps.comment({ taskN, author: 'user', bodyMd: body, replyTo, …})` | no |
| `ask-claude`   | `{ question: string }`           | `eps.comment(…)` then enqueue `kind=eps_qa` run | no (separate qa)   |
| `pause`        | `{}`                             | runner-side: SIGTERM the lockfile PID, post `epm:paused-via-sagan` | no |
| `restart`      | `{}`                             | pause + `spawnIssueRun`                      | yes                 |
| `start`        | `{}`                             | `spawnIssueRun`                              | (it IS the spawn)   |

Each route follows the structure of `approve/route.ts` above. Pause uses a different mechanism (kill via PID file lookup) — see Task 3.2 below.

- [ ] **Step 3: Manual smoke test**

Start the dev server (`pnpm --filter @sagan/web dev`) and curl one route with a valid session cookie:

```bash
curl -i -X POST http://localhost:3000/api/eps-task/192/approve \
  -H "Cookie: sagan-session=<valid-token>" \
  -H "Content-Type: application/json" -d '{}'
```
Expected: `200 OK`. Check `agent_runs` for a new `eps_orchestrator` row.

- [ ] **Step 4: Commit**

```bash
cd <sagan>
git add apps/web/app/api/eps-task
git commit -m "web: API routes for EPS task actions (approve/block/promote/comment/...)"
```

### Task 3.2: `Pause` route — read lockfile, send SIGTERM

**Files:**
- Modify: `<sagan>/apps/web/app/api/eps-task/[number]/pause/route.ts` from Step 2 above with the PID-kill implementation.
- Add helper: `<sagan>/apps/web/src/lib/eps-task-pause.ts`.

- [ ] **Step 1: Helper**

```ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);

export async function pauseOrchestrator(taskN: number, saganSessionId: string) {
  const tasksDir = process.env.EPS_TASKS_DIR!;
  // Status folder may be anywhere — get it from the mirror.
  // Caller passes status as a side input; cleaner to look up here.
  // (For brevity, omit status lookup — assume caller supplies.)
  const folders = ['proposed', 'clarifying', 'planning', 'plan_pending', 'approved',
                   'implementing', 'code_reviewing', 'testing', 'running', 'uploading',
                   'verifying', 'interpreting', 'reviewing', 'awaiting_promotion',
                   'blocked', 'followups_running'];
  for (const status of folders) {
    const lock = join(tasksDir, status, String(taskN), '.orchestrator.pid');
    if (existsSync(lock)) {
      const pid = parseInt(readFileSync(lock, 'utf-8').trim().split('\n')[0], 10);
      if (Number.isFinite(pid)) {
        try { process.kill(pid, 'SIGTERM'); }
        catch (e) { /* already dead */ }
      }
      // Post a marker so the timeline reflects the human action.
      await execFileP('python', [process.env.EPS_TASK_PY!,
        'post-event', String(taskN), 'epm:paused-via-sagan',
        `--source=sagan-user:${saganSessionId}`]);
      return { ok: true, killed_pid: pid };
    }
  }
  return { ok: true, killed_pid: null }; // already not running
}
```

- [ ] **Step 2: Wire the pause route to it; commit.**

```bash
git add apps/web/src/lib/eps-task-pause.ts apps/web/app/api/eps-task/[number]/pause/route.ts
git commit -m "web: pause route reads .orchestrator.pid and sends SIGTERM"
```

### Task 3.3: `ask-claude` route + `kind=eps_qa` run enqueue

**Files:**
- Modify: `<sagan>/apps/web/app/api/eps-task/[number]/ask-claude/route.ts`
- Modify: `<sagan>/services/runner/src/dispatcher.ts` — handle `eps_qa` kind.

- [ ] **Step 1: Route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@sagan/auth';
import { z } from 'zod';
import * as eps from '@/lib/eps-task-api';
import { db, schema } from '@sagan/db';
import { sql } from 'drizzle-orm';

const Body = z.object({ question: z.string().min(1).max(8000) });

export async function POST(req: NextRequest, ctx: { params: { number: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const taskN = parseInt(ctx.params.number, 10);
  const body = Body.parse(await req.json());

  // 1. Write the question as a user comment so it lands in comments.jsonl.
  await eps.comment({
    taskN, author: 'user', bodyMd: body.question, saganSessionId: session.id,
  });

  // 2. Enqueue an eps_qa run.
  const [run] = await db().insert(schema.agentRuns).values({
    kind: 'eps_qa',
    status: 'queued',
    epsTaskN: taskN,
    cwd: process.env.SAGAN_CLIENT_REPOS
      ? JSON.parse(process.env.SAGAN_CLIENT_REPOS).eps
      : null,
    request: { question: body.question, saganSessionId: session.id },
  }).returning({ id: schema.agentRuns.id });

  // Notify dispatcher
  await db().execute(sql`SELECT pg_notify('agent_runs_queued', ${run.id})`);

  return NextResponse.json({ ok: true, runId: run.id });
}
```

- [ ] **Step 2: Dispatcher branch for `eps_qa`**

In `<sagan>/services/runner/src/dispatcher.ts`, locate the kind-switch (likely a `switch` on `row.kind`). Add:

```ts
case 'eps_qa': {
  const prompt = [
    `You are answering a question on EPS task ${row.epsTaskN}.`,
    `The question is in the latest user comment in tasks/<status>/${row.epsTaskN}/comments.jsonl.`,
    `Reply by writing a comment via:`,
    `  python scripts/task.py comment-add ${row.epsTaskN} --author=claude --body-md=<your reply> --reply-to=<the user's comment id>`,
    `Then exit. Be terse, factual, and link to specific events/files where helpful.`,
  ].join('\n');
  await runWithStreaming(row.id, row, prompt, {});
  return;
}
case 'eps_orchestrator': {
  // Already handled by spawnIssueRun upstream; here we just stream events.
  await runWithStreaming(row.id, row, `/issue ${row.epsTaskN}`, {});
  return;
}
```

- [ ] **Step 3: Manual smoke test**

Curl `ask-claude` with a question; watch `agent_runs` for the new `eps_qa` row going through queued → running → completed; check `comments.jsonl` for the Claude reply.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/eps-task/[number]/ask-claude/route.ts services/runner/src/dispatcher.ts
git commit -m "runner+web: ask-claude posts comment + enqueues eps_qa run"
```

### Task 3.4: `/eps/board` page

**Files:**
- Create: `<sagan>/apps/web/app/(app)/eps/board/page.tsx`
- Create: `<sagan>/apps/web/app/(app)/eps/board/Board.tsx` (client component)

- [ ] **Step 1: Server component fetches and groups by column**

```tsx
// apps/web/app/(app)/eps/board/page.tsx
import { db, schema } from '@sagan/db';
import { loadWorkflow, columnsForStatus } from '@sagan/workflow';
import { Board } from './Board';

export const dynamic = 'force-dynamic';

export default async function EpsBoardPage() {
  const rows = await db().select().from(schema.epsTaskMirror)
    .orderBy(schema.epsTaskMirror.updatedAt);
  const wf = loadWorkflow();
  const grouped: Record<string, typeof rows> = {};
  for (const col of wf.columns) grouped[col.name] = [];
  for (const row of rows) {
    const col = columnsForStatus(row.status);
    (grouped[col] ??= []).push(row);
  }
  return <Board columns={wf.columns} grouped={grouped} />;
}
```

- [ ] **Step 2: Client component renders columns and listens for `pg_notify`**

```tsx
// apps/web/app/(app)/eps/board/Board.tsx
'use client';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function Board({ columns, grouped }: { columns: any[]; grouped: Record<string, any[]> }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  useEffect(() => {
    // Subscribe to revalidation via SSE (assumes Sagan already has an SSE endpoint;
    // if not, fall back to a 10s interval here).
    const es = new EventSource('/api/eps-task/mirror-stream');
    es.onmessage = () => startTransition(() => router.refresh());
    return () => es.close();
  }, [router]);

  return (
    <div className="flex gap-4 overflow-x-auto p-4">
      {columns.map((col) => (
        <div key={col.name} className="min-w-[260px] flex-shrink-0">
          <h2 className="text-sm font-semibold mb-2">{col.name}</h2>
          <div className="space-y-2">
            {(grouped[col.name] ?? []).map((task) => (
              <Link
                key={task.number}
                href={`/eps/t/${task.number}`}
                className="block p-3 rounded border bg-card hover:bg-accent">
                <div className="text-xs text-muted-foreground">#{task.number} · {task.kind}</div>
                <div className="text-sm font-medium leading-tight">{task.title}</div>
                {task.latestMarkerKind && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {task.latestMarkerKind}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

If Sagan doesn't have an SSE endpoint, simplify the useEffect to a `setInterval(() => router.refresh(), 10_000)`.

- [ ] **Step 3: Manual verification**

Visit `/eps/board` on the dev server. Confirm columns from workflow.yaml appear and tasks land in correct columns. Click into one — should land on Task 3.5's page.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/eps/
git commit -m "web: /eps/board page renders mirror cache grouped by workflow columns"
```

### Task 3.5: `/eps/t/[number]` task detail page

**Files:**
- Create: `<sagan>/apps/web/app/(app)/eps/t/[number]/page.tsx`
- Create: `<sagan>/apps/web/app/(app)/eps/t/[number]/Timeline.tsx`
- Create: `<sagan>/apps/web/app/(app)/eps/t/[number]/Comments.tsx`
- Create: `<sagan>/apps/web/app/(app)/eps/t/[number]/ActionButtons.tsx`
- Create: `<sagan>/apps/web/app/(app)/eps/t/[number]/AskClaudeModal.tsx`

This task contains a lot of UI code; each component is its own focused file (~80-150 LOC). Implementing one component per sub-step.

- [ ] **Step 1: Page component (server)**

```tsx
// page.tsx
import { db, schema } from '@sagan/db';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Timeline } from './Timeline';
import { Comments } from './Comments';
import { ActionButtons } from './ActionButtons';

export const dynamic = 'force-dynamic';

export default async function EpsTaskPage({ params }: { params: { number: string } }) {
  const n = parseInt(params.number, 10);
  const [task] = await db().select().from(schema.epsTaskMirror)
    .where(eq(schema.epsTaskMirror.number, n));
  if (!task) notFound();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <header className="space-y-1">
        <div className="text-sm text-muted-foreground">
          #{task.number} · {task.kind} · status: <strong>{task.status}</strong>
        </div>
        <h1 className="text-2xl font-semibold">{task.title}</h1>
        {task.blockers?.length ? (
          <div className="text-sm text-destructive">Blocked: {task.blockers[0].reason}</div>
        ) : null}
      </header>

      <ActionButtons number={n} status={task.status} hasCleanResult={task.hasCleanResult} />

      {task.currentPlanMd && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Plan</h2>
          <pre className="whitespace-pre-wrap text-sm bg-muted p-3 rounded">{task.currentPlanMd}</pre>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-2">Body</h2>
        <pre className="whitespace-pre-wrap text-sm bg-muted p-3 rounded">{task.bodyMd}</pre>
      </section>

      <Timeline events={task.eventsTail ?? []} />
      <Comments number={n} comments={task.commentsSummary ?? []} />
    </div>
  );
}
```

- [ ] **Step 2: Timeline component**

```tsx
'use client';
import { useState } from 'react';

export function Timeline({ events }: { events: Array<any> }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">Timeline</h2>
      <ol className="space-y-1 text-sm font-mono">
        {events.map((e, i) => (
          <li key={i} className="border-l-2 pl-3">
            <span className="text-muted-foreground">{e.at?.slice(0, 19)} · </span>
            <span className="font-semibold">{e.kind}</span>
            {e.note && <span> — {e.note}</span>}
            {e.source && <span className="text-xs text-muted-foreground"> ({e.source})</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 3: Comments component**

```tsx
'use client';
import { useState } from 'react';

export function Comments({ number, comments }: { number: number; comments: Array<any> }) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await fetch(`/api/eps-task/${number}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft }),
      });
      setDraft('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">Comments</h2>
      <div className="space-y-2 mb-4">
        {comments.map((c) => (
          <div key={c.id} className="p-3 rounded border bg-card">
            <div className="text-xs text-muted-foreground mb-1">
              {c.author} · {c.created_at.slice(0, 19)}
            </div>
            <div className="text-sm whitespace-pre-wrap">{c.body_md}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 p-2 border rounded text-sm"
          rows={2}
          placeholder="Add a comment..."
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || submitting}
          className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50">
          Send
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: ActionButtons component**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AskClaudeModal } from './AskClaudeModal';

export function ActionButtons({ number, status, hasCleanResult }: {
  number: number; status: string; hasCleanResult: boolean;
}) {
  const router = useRouter();
  const [askOpen, setAskOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function call(path: string, body: any = {}) {
    setBusy(true);
    try {
      const r = await fetch(`/api/eps-task/${number}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) alert(`Failed: ${await r.text()}`);
      router.refresh();
    } finally { setBusy(false); }
  }

  const buttons: Array<[string, () => void, string]> = [];

  if (status === 'plan_pending') {
    buttons.push(['Approve plan', () => call('approve'), 'primary']);
  }
  if (status === 'awaiting_promotion') {
    buttons.push(['Promote (useful)', () => call('promote', { verdict: 'useful' }), 'primary']);
    buttons.push(['Promote (not useful)', () => call('promote', { verdict: 'not-useful' }), 'secondary']);
  }
  if (status === 'blocked') {
    buttons.push(['Unblock', () => call('unblock'), 'primary']);
  } else if (!['completed', 'archived'].includes(status)) {
    buttons.push(['Block', () => {
      const r = prompt('Reason?'); if (r) call('block', { reason: r });
    }, 'destructive']);
  }
  if (['proposed', 'clarifying', 'planning', 'approved', 'implementing',
       'code_reviewing', 'testing', 'running', 'uploading', 'verifying',
       'interpreting', 'reviewing'].includes(status)) {
    buttons.push(['Pause', () => call('pause'), 'secondary']);
    buttons.push(['Restart', () => call('restart'), 'secondary']);
  }
  if (status === 'proposed') {
    buttons.push(['Start', () => call('start'), 'primary']);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map(([label, onClick, variant]) => (
        <button
          key={label}
          onClick={onClick}
          disabled={busy}
          className={`px-3 py-1.5 rounded text-sm ${
            variant === 'primary' ? 'bg-primary text-primary-foreground' :
            variant === 'destructive' ? 'bg-destructive text-destructive-foreground' :
            'bg-secondary text-secondary-foreground'
          } disabled:opacity-50`}>
          {label}
        </button>
      ))}
      <button onClick={() => setAskOpen(true)}
        className="px-3 py-1.5 rounded text-sm bg-secondary text-secondary-foreground">
        Ask Claude
      </button>
      {askOpen && <AskClaudeModal number={number} onClose={() => setAskOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 5: AskClaudeModal component**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AskClaudeModal({ number, onClose }: { number: number; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await fetch(`/api/eps-task/${number}/ask-claude`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      onClose();
      router.refresh();
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background rounded p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-2">Ask Claude about task #{number}</h3>
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          rows={5}
          autoFocus
          className="w-full p-2 border rounded text-sm"
          placeholder="Your question — Claude will reply as a comment on this task."
        />
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose} className="px-3 py-1.5 text-sm">Cancel</button>
          <button
            onClick={submit}
            disabled={!q.trim() || submitting}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50">
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Manual smoke test**

Visit `/eps/t/<some_task_number>`. Verify all sections render. Click each action button and confirm the API call and DB / file changes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/\(app\)/eps/t/
git commit -m "web: /eps/t/[number] task detail page with timeline, comments, actions"
```

---

## Phase 4 — Surgical edits to existing Sagan code

### Task 4.1: Excise experiment branch from `pipeline/advance/route.ts`

**Files:**
- Modify: `<sagan>/apps/web/app/api/pipeline/advance/route.ts` (1030 lines, multi-purpose).

This task does NOT have a TDD step because there are no existing tests for this route, and adding integration tests for the kept branches is a larger refactor. Instead, verify by manual exercise of `/pipeline` after the edit.

- [ ] **Step 1: Read the full file and inventory branches**

```bash
grep -n "kind === " <sagan>/apps/web/app/api/pipeline/advance/route.ts
```
Expected: lists of `kind === 'experiment'`, `kind === 'todo'`, `kind === 'clean_result'`, `kind === 'idea'`, etc.

- [ ] **Step 2: Identify the experiment branch span**

For each `kind === 'experiment'` block (likely a top-level `if` or `case`), note the line range.

- [ ] **Step 3: Delete the experiment branch(es)**

Remove the matched ranges. Run `pnpm --filter @sagan/web typecheck` and resolve any "unused import" / "unused helper" errors by deleting the unused code.

- [ ] **Step 4: Manual verification**

Hit `/pipeline` in the dev server. Confirm todos/clean-results/ideas still advance. Confirm no experiment-related buttons appear; if they do, find their data source and remove.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/pipeline/advance/route.ts
git commit -m "pipeline/advance: remove experiment branch (moved to EPS /issue skill)"
```

### Task 4.2: Strip experiment-column wiring from `PipelineBoard.tsx`

**Files:**
- Modify: `<sagan>/apps/web/app/(app)/pipeline/PipelineBoard.tsx`

- [ ] **Step 1: Identify experiment column wiring**

```bash
grep -n "experiment" <sagan>/apps/web/app/\(app\)/pipeline/PipelineBoard.tsx
```

- [ ] **Step 2: Remove experiment-column wiring; leave todos / clean-results / ideas alone**

Each match should be evaluated; delete the experiment-specific code paths. EPS tasks DO NOT go on this board in v1.

- [ ] **Step 3: Typecheck and visit `/pipeline` to confirm no regression**

```bash
cd <sagan>
pnpm --filter @sagan/web typecheck
pnpm --filter @sagan/web dev
# visit http://localhost:3000/pipeline
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/pipeline/PipelineBoard.tsx
git commit -m "PipelineBoard: drop experiment-column wiring; non-EPS scope only"
```

### Task 4.3: Remove EPS-experiment dispatcher logic from `services/runner`

**Files:**
- Modify: `<sagan>/services/runner/src/dispatcher.ts`
- Modify: `<sagan>/services/runner/src/watcher.ts`
- Modify: `<sagan>/services/runner/src/lib/agent-recovery.ts`
- Modify: `<sagan>/services/runner/src/lib/followups-watcher.ts`
- Possibly modify: `<sagan>/services/runner/src/lib/experiment-workflow.ts` (untracked in `main`).

- [ ] **Step 1: For each file, inventory the EPS-experiment-specific logic**

```bash
grep -n "experiment\|epm:" <sagan>/services/runner/src/dispatcher.ts | head -30
```

The criteria: logic that runs an EPS-shaped state machine (advancing experiments through stages, posting `epm:*` markers from Sagan-side, dispatching the experimenter / planner / code-reviewer sub-agents from inside Sagan). This is what duplicates `/issue` and must go.

KEEP: generic process supervision, crash recovery, RunPod-for-Sagan-internal-jobs, `kind=todo`/`clean_result`/`project_narrative`/`weekly_digest` etc. logic.

- [ ] **Step 2: Delete the identified spans in each file**

Conservatively. After each deletion, typecheck:

```bash
pnpm --filter @sagan/runner typecheck
```

- [ ] **Step 3: Restart the runner; confirm Sagan-internal jobs still work**

Smoke-test by triggering a weekly_digest or daily_log_entry run and confirming it completes.

- [ ] **Step 4: Commit**

```bash
git add services/runner/src/
git commit -m "runner: remove EPS-experiment dispatcher logic; /issue owns it now"
```

---

## Phase 5 — Documentation and supersession

### Task 5.1: Update Sagan `CLAUDE.md`

**Files:**
- Modify: `<sagan>/CLAUDE.md`

- [ ] **Step 1: Delete the "EPS workflow state is canonical in Sagan" section**

Find the paragraph starting "EPS workflow state is canonical in Sagan." Delete it and the surrounding bullet about API tokens for workflow state.

- [ ] **Step 2: Add the new "EPS as client repo" section**

In its place:

```markdown
## EPS as client repo

EPS workflow state is canonical in EPS local files (see
`<eps>/.claude/workflow.yaml`). Sagan reads it through a fs-watch
mirror cache (`services/runner/src/jobs/eps-mirror.ts`) and writes
back by shelling out to EPS `scripts/task.py` from
`apps/web/src/lib/eps-task-api.ts`.

For any human gate (approve, promote, block, unblock, comment),
Sagan's runner passes `--source=sagan-user:<sessions.id>` so the
EPS audit log records the human-vs-agent boundary precisely.

The `/issue` skill in EPS is the orchestrator. Sagan does not run a
parallel state machine — its only orchestration responsibility is
spawning fresh `claude` CLI subprocesses with `cwd=EPS` and
`prompt=/issue N` after gate approvals.
```

- [ ] **Step 3: Relax the tenant-agnostic guardrail**

Locate the "Tenant-agnostic guardrail" section. Append:

```markdown
**EPS exception:** Sagan's `services/runner` is allowed to spawn
`claude` CLI subprocesses with `cwd` set to a registered client
repo (see `SAGAN_CLIENT_REPOS`). The runner does NOT touch client
repo files directly — all writes go through the client's own writer
(EPS `scripts/task.py`).
```

- [ ] **Step 4: Delete the `/issue <N> means Sagan experiments.number` sentence**

In the EPS workflow section, find and delete that sentence and replace it with: `/issue <N> means EPS task number N (see <eps>/tasks/<status>/<N>/).`

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md: invert EPS-canonical guidance; relax tenant guardrail for cwd"
```

### Task 5.2: Update EPS `CLAUDE.md`

**Files:**
- Modify: `<eps>/CLAUDE.md`

- [ ] **Step 1: Update dashboard URL references**

Find all references to `https://eps.superkaiba.com/tasks/<N>` and change to `https://sagan.superkaiba.com/eps/t/<N>`. Add a note that the dashboard is hosted by Sagan now.

- [ ] **Step 2: Add a cross-link to the Sagan plan**

In an appropriate section (e.g., the workflow section):

```markdown
The Sagan dashboard surface for this workflow is described in
`<sagan>/docs/exec-plans/sagan-eps-control-surface-plan.md`.
```

- [ ] **Step 3: Commit**

```bash
cd <eps>
git add CLAUDE.md
git commit -m "CLAUDE.md: point dashboard URLs at sagan.superkaiba.com/eps/t/<N>"
```

---

## Phase 6 — End-to-end verification

### Task 6.1: Run a real EPS task through Sagan only

**Files:** none (manual smoke test)

- [ ] **Step 1: Pick a quiet existing task in `proposed`**

```bash
ls /home/thomasjiralerspong/explore-persona-space/tasks/proposed/ | head -5
```
Pick one (e.g., the lowest-numbered one). Note its number.

- [ ] **Step 2: Open `/eps/t/<N>` in browser**

Verify it renders with timeline, body, no plan yet, action buttons including `Start`.

- [ ] **Step 3: Click `Start`. Watch the timeline**

Expected: a new `eps_orchestrator` run appears in `agent_runs`. Within ~30s the timeline shows `epm:orchestrator-locked` (nope, that's only on collision), then progress markers from the planning step, ending in `epm:plan` and status → `plan_pending`.

- [ ] **Step 4: Read the plan in Sagan; add a comment; click `Approve plan`**

The comment should appear in `comments.jsonl` (verify on disk). Status moves to `approved`. A fresh `eps_orchestrator` run starts (the implementer step).

- [ ] **Step 5: Block mid-run**

While the implementer is running, click `Block` with a reason. The body should receive SIGTERM (this is `Pause`; for `Block`, the marker is posted but the body is not necessarily killed — design choice to revisit). Status → `blocked`.

- [ ] **Step 6: Unblock**

Click `Unblock`. Status returns to prior; new body spawned.

- [ ] **Step 7: Let it reach `awaiting_promotion`, click `Promote` (useful)**

Status moves to `completed`. Any follow-ups defined in workflow.yaml fire.

- [ ] **Step 8: Concurrent body test**

In a terminal: `cd <eps> && claude --prompt "/issue <N>"` while a Sagan-spawned body is alive for `<N>`. Expected: terminal body exits with `epm:orchestrator-locked` marker.

- [ ] **Step 9: Pass criterion**

The entire flow above completed without typing in a terminal except for the deliberate concurrency test.

- [ ] **Step 10: Record acceptance**

Write a brief acceptance note in `docs/exec-plans/sagan-eps-control-surface-acceptance.md` summarizing what was tested and any deferred items. Commit.

---

## Phase 7 — Merge

### Task 7.1: Land EPS worktree

- [ ] **Step 1: Push EPS branch**

```bash
cd /home/thomasjiralerspong/explore-persona-space/.claude/worktrees/sagan-control-surface
git push -u origin sagan-control-surface
```

- [ ] **Step 2: Open PR via `gh`**

```bash
gh pr create --title "EPS task workflow: Sagan dashboard write-side" --body "$(cat <<'EOF'
## Summary
- Adds `task.py comment-add` for dashboard-driven comments.
- Adds `scripts/orchestrator_lock.py` (PID-file lock per task).
- Adds `--source` audit flag to mutating subcommands; gates `promote` on `cli` or `sagan-user:*`.
- Wires lock acquire/release into the `/issue` skill.
- Documents the callable API in `tasks/CALLABLE_API.md`.

## Test plan
- [x] `pytest tests/test_task_comment_add.py`
- [x] `pytest tests/test_orchestrator_lock.py`
- [x] `pytest tests/test_task_source_flag.py`
- [x] Manual concurrency test (two /issue invocations on the same task)
EOF
)"
```

- [ ] **Step 3: Merge after review (if applicable)**

User-driven; do not auto-merge.

### Task 7.2: Land Sagan worktree

- [ ] **Step 1: Push Sagan branch**

```bash
cd /home/thomasjiralerspong/sagan/.claude/worktrees/sagan-control-surface
git push -u origin sagan-control-surface
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "Sagan EPS control-surface dashboard" --body "$(cat <<'EOF'
## Summary
- Adds `/eps/board` and `/eps/t/[number]` pages backed by a fs-watch mirror cache.
- Adds `services/runner` jobs `eps-mirror` and helper `eps-orchestrator` (spawnIssueRun).
- Adds API routes for approve/block/unblock/promote/comment/ask-claude/pause/restart/start.
- Removes EPS-experiment branches from `pipeline/advance/route.ts` and `services/runner`.
- Inverts CLAUDE.md guidance: EPS local files are canonical workflow state.

## Test plan
- [x] vitest unit tests for `eps-orchestrator`, `eps-task-api`, `@sagan/workflow`.
- [x] integration test for `eps-mirror` against a tmp tasks/ tree.
- [x] manual E2E: full /issue loop through Sagan on a real EPS task.

Companion design + impl plans:
- `docs/exec-plans/sagan-eps-control-surface-plan.md`
- `docs/exec-plans/sagan-eps-control-surface-impl.md`
EOF
)"
```

- [ ] **Step 3: User-driven merge after EPS PR is merged.**

---

## Self-review notes

The plan above was self-reviewed for placeholder content, internal consistency, and spec coverage. Caveats:

- **Phase 1.3 (wire lock into SKILL.md)** is descriptive rather than test-driven because SKILL.md is interpreted by Claude at runtime; the test happens in 1.3 Step 5 (manual concurrency smoke).
- **Phase 4 (surgical edits)** does NOT include TDD steps because the target files have no existing tests. Adding integration tests for the kept branches is intentionally out of scope; verification is manual exercise of `/pipeline`.
- **`task.py view --json`** output shape is assumed in `eps-mirror`. If the real shape differs, fall back to reading files directly (the implementation already does this for `body_md`, `events_tail`, `comments_summary`).
- **`runWithStreaming` row.cwd plumbing** is described but the exact existing signature in `session.ts` must be respected when implementing; if the function uses a different field name, propagate.
- **One known design gap:** the `Block` button on a running body just posts a marker + changes status; it does NOT kill the body. If you want Block to also kill, use the Pause+Block pattern from Task 3.2. Decision deferred to v2.
