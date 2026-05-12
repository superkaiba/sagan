#!/usr/bin/env bash
set -euo pipefail
cd /home/thomasjiralerspong/sagan/services/runner
exec /home/thomasjiralerspong/sagan/node_modules/.bin/tsx scripts/apply-narrative-edit.ts
