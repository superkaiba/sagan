#!/usr/bin/env python3
"""Sagan workflow-state client for agent scripts.

All mutations go through Sagan's HTTP API. Configure with:

  SAGAN_BASE_URL=https://sagan.superkaiba.com
  SAGAN_API_TOKEN=sk_...

The integer experiment argument is Sagan experiments.number, not a GitHub
issue number.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


EXPERIMENT_STATUSES = {
    "proposed",
    "clarifying",
    "gate_pending",
    "planning",
    "plan_pending",
    "approved",
    "awaiting_approval",
    "queued",
    "implementing",
    "code_reviewing",
    "testing",
    "running",
    "uploading",
    "verifying",
    "interpreting",
    "reviewing",
    "awaiting_promotion",
    "followups_running",
    "shared",
    "blocked",
    "completed",
    "done_experiment",
    "done_impl",
    "failed",
    "cancelled",
    "archived",
}

CLEAN_RESULT_STATUSES = {"draft", "reviewing", "approved", "archived", "blocked"}
EXPERIMENT_KINDS = {"experiment", "infra", "survey"}
PRIORITIES = {"low", "normal", "high", "urgent"}
COMPUTE_SIZES = {"none", "small", "medium", "large"}
RUNPOD_ACCOUNTS = {"team", "personal"}


class ApiError(RuntimeError):
    def __init__(self, status: int, body: str):
        self.status = status
        self.body = body
        super().__init__(f"HTTP {status}: {body}")


def base_url(args: argparse.Namespace) -> str:
    value = args.base_url or os.environ.get("SAGAN_BASE_URL") or os.environ.get("NEXT_PUBLIC_SITE_URL")
    if not value:
        value = "http://localhost:3100"
    return value.rstrip("/")


def token(args: argparse.Namespace) -> str:
    value = args.token or os.environ.get("SAGAN_API_TOKEN")
    if not value:
        raise SystemExit("SAGAN_API_TOKEN is required for Sagan API access")
    return value


def request(args: argparse.Namespace, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url(args)}{path}",
        data=data,
        method=method,
        headers={
            "authorization": f"Bearer {token(args)}",
            "accept": "application/json",
            **({"content-type": "application/json"} if data is not None else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=args.timeout) as res:
            text = res.read().decode("utf-8")
    except urllib.error.HTTPError as err:
        raise ApiError(err.code, err.read().decode("utf-8", errors="replace")) from err
    return json.loads(text) if text.strip() else None


def print_json(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True, default=str))


def read_text(value: str | None, file_path: str | None) -> str | None:
    if value is not None and file_path is not None:
        raise SystemExit("pass either inline text or a file path, not both")
    if file_path is None:
        return value
    with open(file_path, "r", encoding="utf-8") as handle:
        return handle.read()


def parse_json_object(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise SystemExit("--metadata-json must decode to a JSON object")
    return parsed


def parse_tags(value: str | None) -> list[str] | None:
    if value is None:
        return None
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_bool(value: str | None) -> bool | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "y"}:
        return True
    if normalized in {"0", "false", "no", "n"}:
        return False
    raise SystemExit(f"invalid boolean: {value}")


def by_number(args: argparse.Namespace, number: int) -> dict[str, Any]:
    return request(args, "GET", f"/api/experiments/by-number/{number}")


def experiment_id(args: argparse.Namespace, number: int) -> str:
    data = by_number(args, number)
    exp_id = data.get("experiment", {}).get("id")
    if not exp_id:
        raise SystemExit(f"experiment #{number} not found")
    return exp_id


def cmd_list(args: argparse.Namespace) -> None:
    query = f"?limit={args.limit}"
    if args.status:
        query += f"&status={args.status}"
    print_json(request(args, "GET", f"/api/experiments{query}"))


def cmd_view(args: argparse.Namespace) -> None:
    print_json(by_number(args, args.number))


def cmd_status(args: argparse.Namespace) -> None:
    exp_id = experiment_id(args, args.number)
    body = {"status": args.status}
    if args.note is not None:
        body["note"] = args.note
    print_json(request(args, "PATCH", f"/api/experiments/{exp_id}", body))


def cmd_patch(args: argparse.Namespace) -> None:
    exp_id = experiment_id(args, args.number)
    body: dict[str, Any] = {}
    body_text = read_text(args.body, args.body_file)
    hypothesis = read_text(args.hypothesis, args.hypothesis_file)
    if args.title is not None:
        body["title"] = args.title
    if body_text is not None:
        body["body"] = body_text
    if hypothesis is not None:
        body["hypothesis"] = hypothesis
    if args.kind is not None:
        body["kind"] = args.kind
    if args.compute_size is not None:
        body["computeSize"] = None if args.compute_size == "none" else args.compute_size
    if args.priority is not None:
        body["priority"] = args.priority
    if args.runpod_account is not None:
        body["runpodAccount"] = args.runpod_account
    if args.tags is not None:
        body["tags"] = parse_tags(args.tags)
    has_clean_result = parse_bool(args.has_clean_result)
    if has_clean_result is not None:
        body["hasCleanResult"] = has_clean_result
    if args.status is not None:
        body["status"] = args.status
    if args.note is not None:
        body["note"] = args.note
    if not body:
        raise SystemExit("patch needs at least one field")
    print_json(request(args, "PATCH", f"/api/experiments/{exp_id}", body))


def cmd_marker(args: argparse.Namespace) -> None:
    exp_id = experiment_id(args, args.number)
    metadata = parse_json_object(args.metadata_json)
    for key, value in {
        "review_pair": args.review_pair,
        "round": args.round,
        "reviewer": args.reviewer,
        "verdict": args.verdict,
        "required_fix": args.required_fix,
        "reconciler_decision": args.reconciler_decision,
        "next_workflow_status": args.next_status,
    }.items():
        if value is not None:
            metadata[key] = value
    body = {
        "eventType": args.event_type,
        "markerType": args.marker,
        "fromStatus": args.from_status,
        "toStatus": args.to_status,
        "note": args.note,
        "metadata": metadata or None,
        "actorKind": args.actor_kind,
    }
    body = {key: value for key, value in body.items() if value is not None}
    print_json(request(args, "POST", f"/api/experiments/{exp_id}/workflow-events", body))


def cmd_promote(args: argparse.Namespace) -> None:
    exp_id = experiment_id(args, args.number)
    body = {"verdict": args.verdict}
    if args.note is not None:
        body["note"] = args.note
    print_json(request(args, "POST", f"/api/experiments/{exp_id}/promote", body))


def cmd_clean_result(args: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    body_md = read_text(args.body_md, args.body_md_file)
    if args.title is not None:
        body["title"] = args.title
    if args.claim is not None:
        body["claim"] = args.claim
    if body_md is not None:
        body["bodyMd"] = body_md
    if args.confidence is not None:
        body["confidence"] = args.confidence
    if args.status is not None:
        body["status"] = args.status
    if not body:
        raise SystemExit("clean-result patch needs at least one field")
    print_json(request(args, "PATCH", f"/api/clean-results/{args.clean_result_id}", body))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Sagan workflow-state HTTP client")
    parser.add_argument("--base-url", help="Sagan base URL; defaults to SAGAN_BASE_URL or NEXT_PUBLIC_SITE_URL")
    parser.add_argument("--token", help="Bearer token; defaults to SAGAN_API_TOKEN")
    parser.add_argument("--timeout", type=int, default=30)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("list", help="List experiments")
    p.add_argument("--status", choices=sorted(EXPERIMENT_STATUSES))
    p.add_argument("--limit", type=int, default=100)
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("view", help="View one experiment by Sagan experiment number")
    p.add_argument("number", type=int)
    p.set_defaults(func=cmd_view)

    p = sub.add_parser("status", help="Set experiment status")
    p.add_argument("number", type=int)
    p.add_argument("status", choices=sorted(EXPERIMENT_STATUSES))
    p.add_argument("--note")
    p.set_defaults(func=cmd_status)

    p = sub.add_parser("patch", help="Patch experiment metadata or status")
    p.add_argument("number", type=int)
    p.add_argument("--title")
    p.add_argument("--body")
    p.add_argument("--body-file")
    p.add_argument("--hypothesis")
    p.add_argument("--hypothesis-file")
    p.add_argument("--status", choices=sorted(EXPERIMENT_STATUSES))
    p.add_argument("--kind", choices=sorted(EXPERIMENT_KINDS))
    p.add_argument("--compute-size", choices=sorted(COMPUTE_SIZES))
    p.add_argument("--priority", choices=sorted(PRIORITIES))
    p.add_argument("--runpod-account", choices=sorted(RUNPOD_ACCOUNTS))
    p.add_argument("--tags", help="Comma-separated tag list")
    p.add_argument("--has-clean-result", help="true/false")
    p.add_argument("--note")
    p.set_defaults(func=cmd_patch)

    p = sub.add_parser("marker", aliases=["markers"], help="Post an epm:* workflow marker")
    p.add_argument("number", type=int)
    p.add_argument("marker")
    p.add_argument("--event-type", default="note")
    p.add_argument("--from-status")
    p.add_argument("--to-status")
    p.add_argument("--note")
    p.add_argument("--metadata-json")
    p.add_argument("--actor-kind", default="agent")
    p.add_argument("--review-pair", choices=["code_review", "interpretation", "clean_result"])
    p.add_argument("--round", type=int)
    p.add_argument("--reviewer")
    p.add_argument("--verdict", choices=["pass", "needs_targeted_fix", "blocked_needs_user_decision", "fail_not_worth_continuing"])
    p.add_argument("--required-fix")
    p.add_argument("--reconciler-decision")
    p.add_argument("--next-status", choices=sorted(EXPERIMENT_STATUSES))
    p.set_defaults(func=cmd_marker)

    p = sub.add_parser("promote", help="Promote pending experiment result")
    p.add_argument("number", type=int)
    p.add_argument("verdict", choices=["useful", "not-useful", "not_useful"])
    p.add_argument("--note")
    p.set_defaults(func=lambda args: (setattr(args, "verdict", args.verdict.replace("-", "_")), cmd_promote(args))[1])

    p = sub.add_parser("clean-result", help="Patch a clean-result record by UUID")
    p.add_argument("clean_result_id")
    p.add_argument("--title")
    p.add_argument("--claim")
    p.add_argument("--body-md")
    p.add_argument("--body-md-file")
    p.add_argument("--confidence", choices=["LOW", "MODERATE", "HIGH"])
    p.add_argument("--status", choices=sorted(CLEAN_RESULT_STATUSES))
    p.set_defaults(func=cmd_clean_result)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        args.func(args)
        return 0
    except ApiError as err:
        print(err.body or f"HTTP {err.status}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
