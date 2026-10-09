#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# check_no_secrets.sh  —  "no secrets in repo" guardrail (Phase 1 / GAP-001/002)
#
# Fails (exit 1) if a plaintext secret is found in any git-tracked file.
# Use as a pre-commit hook and/or a CI step. Read-only; makes no changes.
#
# Usage:        bash scripts/check_no_secrets.sh
# Pre-commit:   call this script from .git/hooks/pre-commit
# -----------------------------------------------------------------------------
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

PATHSPEC=(':!scripts/check_no_secrets.sh' ':!*.lock' ':!yarn.lock' ':!package-lock.json')
fail=0

echo "== no-secrets guardrail =="

# 1) Known previously-leaked password literals (block re-introduction).
if git grep -nE 'QplazmMzalpq|Qplazm@10' -- "${PATHSPEC[@]}" 2>/dev/null; then
  echo "  ✗ known leaked password literal found (see above)"; fail=1
fi

# 2) MongoDB URI with an EMBEDDED plaintext password.
#    Placeholders are allowed: <...>, ****, *PASSWORD*, REDACTED.
if git grep -nE 'mongodb(\+srv)?://[^/@:]+:[^@/]+@' -- "${PATHSPEC[@]}" 2>/dev/null \
     | grep -vE 'mongodb(\+srv)?://[^/@:]+:(<[^>]+>|\*+|[A-Za-z_]*PASSWORD[A-Za-z_]*|REDACTED)@' ; then
  echo "  ✗ MongoDB URI with embedded plaintext password found (see above)"; fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "BLOCKED: plaintext secret(s) detected."
  echo "Use placeholders like <MONGO_PASSWORD> in docs; keep real values in .env (gitignored)."
  exit 1
fi

echo "  ✓ clean — no plaintext secrets detected in tracked files"
exit 0
