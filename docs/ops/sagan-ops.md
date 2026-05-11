# Sagan Ops Notes

## Operating Principles

- The current `.env` database is approved as a disposable/dev QA target for this rescue session.
- Important production data still requires backup/export and explicit approval before destructive operations.
- Do not push, deploy, terminate RunPod volumes, or rotate secrets from Sagan without explicit owner approval.
- Runner prompt/session changes require a runner restart before the background service uses the new code.

## Preflight Before Production-Affecting Work

1. Confirm the target environment and database URL.
2. Capture `git status --short` and preserve unrelated dirty work.
3. Run `pnpm typecheck`.
4. For web changes, run `pnpm --filter @sagan/web build`.
5. For DB changes, run `pnpm --filter @sagan/db db:generate`, review the generated SQL, then migrate only the approved target.
6. For runner changes, run `pnpm --filter @sagan/runner typecheck` and a runner smoke/controlled `runSession` QA path.

## Runner

- The runner is intended to run under systemd on the VM.
- Restart after code or prompt changes:

```bash
sudo systemctl restart sagan-runner
sudo systemctl status sagan-runner --no-pager
```

- Use `/admin/health` to inspect active agent runs, recent jobs, notification email status, active experiments, and active pods.
- Use stop before terminate for RunPod. Stop preserves the volume; terminate needs a separate explicit approval path.

## Deploy And Rollback

- Vercel deploys should happen only after owner approval.
- Keep preview/deploy approval separate from agent plan approval.
- If a deployment regresses, use Vercel rollback first. Do not rewrite local history or reset the working tree to hide the issue.
- DB rollback requires a backup/export and a reviewed rollback migration. Do not rely on `git reset` for data rollback.

## Agent-Owned Changes

- Agent runs should record the request, plan, approval decision, events, and verification commands.
- Apply/code-changing runs must not push or deploy by themselves.
- Revert only agent-owned commits or targeted hunks. Never use `git reset --hard` or checkout over user work.
