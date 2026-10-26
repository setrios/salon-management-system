#!/usr/bin/env bash
# One-time correction of the gate issues' verification targets (run from the repo root).
# Requires: gh CLI installed and authenticated (`gh auth login`), push access
# to setrios/salon-management-system.
# The coding agent cannot run this (CLAUDE.md forbids non-idempotent git/remote
# actions) — the human runs it.
#
# Why: issues #4, #5 and #6 were imported from docs/issue-import.csv before the
# ticket renumbering. Their bodies cite ticket IDs that either do not exist or
# belong to another stage, so each gate would verify the wrong tickets. The
# bodies are not edited in place: the PLAN-GATE record
# (logs/2026-10-22-plan-gate-decision.md) fixes "body text of imported issues is
# immutable, the comment is the audit trail". This script appends that comment.
#
# Idempotent: an issue whose comments already contain its skip pattern is skipped.
#
# What it does:
#   1. comments on #4 (G1), #5 (G2), #6 (G3) with the correct verification set
#   2. comments on #16 and #35 only if their v1.3 Source note is absent
#
# Usage: bash docs/github-issues-patch.sh [--dry-run]

set -euo pipefail

REPO="setrios/salon-management-system"
MARKER="Correction (ticket renumbering)"
V13_MARKER="Source updated for SRS v1.3"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

comment() {  # comment <issue-number> <skip-pattern> <body>
  local n="$1" skip="$2" body="$3"
  if gh issue view "$n" --repo "$REPO" --json comments --jq '.comments[].body' \
       | grep -qF "$skip"; then
    echo "  #${n}: already corrected — skipped"
    return
  fi
  if [ "$DRY_RUN" = "1" ]; then
    echo "  #${n}: would comment"
  else
    gh issue comment "$n" --repo "$REPO" --body "$body" >/dev/null
    echo "  #${n}: comment added"
  fi
}

echo "Correcting gate verification targets in ${REPO}..."

comment 4 "$MARKER" "${MARKER}.
Correct verification set for stage S1 (foundations): SMS-22, SMS-23, SMS-24 — not SMS-22/31/32.
Tests for these features: SMS-21. Source: docs/ticket-list.md, plan §6.
The body above was imported before the renumbering and is kept unchanged as history."

comment 5 "$MARKER" "${MARKER}.
Correct verification set for stage S2 (client booking core): SMS-25, SMS-26, SMS-27 — not SMS-25/34/35.
Tests for these features: SMS-8 and SMS-19. Source: docs/ticket-list.md, plan §6.
The body above was imported before the renumbering and is kept unchanged as history."

comment 6 "$MARKER" "${MARKER}.
Correct verification set for stages S3+S4: SMS-28, SMS-29, SMS-30, SMS-31 — not SMS-28/37/38/39.
Tests for these features: SMS-10, SMS-11, SMS-17, SMS-18. Source: docs/ticket-list.md, plan §6.
The body above was imported before the renumbering and is kept unchanged as history."

comment 16 "$V13_MARKER" "Source updated for SRS v1.3: adds REQ-F-032 (popular services report, SCN-14) and REQ-F-033 (stock levels snapshot, SCN-15).

Original coverage of REQ-F-022 (revenue reports) is unchanged. See commit f55a5fe and docs/ticket-list.md for the updated Source field."

comment 35 "$V13_MARKER" "Source updated for SRS v1.3: adds REQ-F-032 (popular services report, SCN-14) and REQ-F-033 (stock levels snapshot, SCN-15).

Original coverage of REQ-F-022 (revenue reports) is unchanged. See commit f55a5fe and docs/ticket-list.md for the updated Source field."

echo "Done. Verify with: gh issue view 4 --repo ${REPO} --json comments"
