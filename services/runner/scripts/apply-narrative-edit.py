#!/usr/bin/env python3
"""One-off: apply the two narrative revisions and resolve the comments.

Plain stdlib + psycopg2. Reads DATABASE_URL_DIRECT from /home/.../.env.
"""
from __future__ import annotations

import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_PATH = REPO_ROOT / ".env"

NARRATIVE_ID = "b1c10e64-8b98-4f65-b127-55267de1f526"
RUN_ID = "257ff27b-ef3c-4ff2-9207-833c99f66dff"
COMMENT_1_ID = "7a158a32-9e17-490e-8bce-085ed9d97ff1"
COMMENT_2_ID = "f7afc9e9-83a8-4999-a0ab-510396e25507"

C1_NEEDLE = " Some are bound to a content axis by training distributions that happen to be narrow (emergent misalignment)."
C2A_NEEDLE = " Every citation is an inline link — click the author/title to open the paper on arXiv."
SVG_RE = re.compile(r'<svg class="diagram"[\s\S]*?</svg>\s*')

SUMMARY_1 = (
    'Removed the sentence "Some are bound to a content axis by training distributions that happen '
    'to be narrow (emergent misalignment)." from the lede of the "What we\'re studying" section, '
    'per the reviewer request.'
)
SUMMARY_2 = (
    'Removed the sentence "Every citation is an inline link — click the author/title to open the '
    'paper on arXiv." from the Prior work intro, and removed the inline SVG Q1–Q5 relationship '
    'diagram from the "What we\'re studying" section, per the reviewer request.'
)


def load_env() -> None:
    text = ENV_PATH.read_text(encoding="utf-8")
    for raw in text.splitlines():
        m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$", raw, flags=re.IGNORECASE)
        if not m:
            continue
        key, val = m.group(1), m.group(2)
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        os.environ.setdefault(key, val)


def main() -> int:
    load_env()
    url = os.environ.get("DATABASE_URL_DIRECT") or os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: no DATABASE_URL_DIRECT or DATABASE_URL", file=sys.stderr)
        return 1

    try:
        import psycopg2  # type: ignore
    except ImportError:
        try:
            import psycopg  # type: ignore
            return run_psycopg3(url, psycopg)
        except ImportError:
            print("ERROR: neither psycopg2 nor psycopg is installed", file=sys.stderr)
            return 1
    return run_psycopg2(url, psycopg2)


def run_psycopg2(url: str, psycopg2) -> int:
    with psycopg2.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select body_md from project_narratives where id = %s limit 1",
                (NARRATIVE_ID,),
            )
            row = cur.fetchone()
            if not row:
                print(f"ERROR: narrative not found: {NARRATIVE_ID}", file=sys.stderr)
                return 1
            before: str = row[0]
            body = apply_edits(before)
            now = datetime.now(timezone.utc)

            cur.execute(
                "update project_narratives set body_md = %s, updated_at = %s where id = %s",
                (body, now, NARRATIVE_ID),
            )
            cur.execute(
                "update comments set resolved_at = %s, resolved_by = null, resolved_summary_md = %s, agent_run_id = %s, updated_at = %s where id = %s",
                (now, SUMMARY_1, RUN_ID, now, COMMENT_1_ID),
            )
            cur.execute(
                "update comments set resolved_at = %s, resolved_by = null, resolved_summary_md = %s, agent_run_id = %s, updated_at = %s where id = %s",
                (now, SUMMARY_2, RUN_ID, now, COMMENT_2_ID),
            )
            cur.execute(
                "select id, resolved_at, agent_run_id from comments where entity_id = %s",
                (NARRATIVE_ID,),
            )
            verify = cur.fetchall()
            print(f"before_bytes={len(before)} after_bytes={len(body)} diff={len(before) - len(body)}")
            for r in verify:
                print(f"comment {r[0]} resolved_at={r[1]} agent_run_id={r[2]}")
        conn.commit()
    return 0


def run_psycopg3(url: str, psycopg) -> int:
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select body_md from project_narratives where id = %s limit 1",
                (NARRATIVE_ID,),
            )
            row = cur.fetchone()
            if not row:
                print(f"ERROR: narrative not found: {NARRATIVE_ID}", file=sys.stderr)
                return 1
            before: str = row[0]
            body = apply_edits(before)
            now = datetime.now(timezone.utc)

            cur.execute(
                "update project_narratives set body_md = %s, updated_at = %s where id = %s",
                (body, now, NARRATIVE_ID),
            )
            cur.execute(
                "update comments set resolved_at = %s, resolved_by = null, resolved_summary_md = %s, agent_run_id = %s, updated_at = %s where id = %s",
                (now, SUMMARY_1, RUN_ID, now, COMMENT_1_ID),
            )
            cur.execute(
                "update comments set resolved_at = %s, resolved_by = null, resolved_summary_md = %s, agent_run_id = %s, updated_at = %s where id = %s",
                (now, SUMMARY_2, RUN_ID, now, COMMENT_2_ID),
            )
            cur.execute(
                "select id, resolved_at, agent_run_id from comments where entity_id = %s",
                (NARRATIVE_ID,),
            )
            verify = cur.fetchall()
            print(f"before_bytes={len(before)} after_bytes={len(body)} diff={len(before) - len(body)}")
            for r in verify:
                print(f"comment {r[0]} resolved_at={r[1]} agent_run_id={r[2]}")
        conn.commit()
    return 0


def apply_edits(body: str) -> str:
    if C1_NEEDLE not in body:
        raise RuntimeError("comment 1 target string not found")
    body = body.replace(C1_NEEDLE, "", 1)
    if C2A_NEEDLE not in body:
        raise RuntimeError("comment 2 inline-link sentence not found")
    body = body.replace(C2A_NEEDLE, "", 1)
    new_body, n = SVG_RE.subn("", body, count=1)
    if n != 1:
        raise RuntimeError("Q1..Q5 SVG diagram not found")
    return new_body


if __name__ == "__main__":
    sys.exit(main())
