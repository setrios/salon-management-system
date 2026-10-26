#!/usr/bin/env bash
# One-time setup of the SDD workflow in GitHub Issues (run from the repo root).
# Requires: gh CLI installed and authenticated (`gh auth login`), push access
# to setrios/salon-management-system.
# The coding agent cannot run this (no gh on this machine, read-only network
# per CLAUDE.md) — the student runs it.
#
# What it does:
#   1. creates the workflow labels (statuses, 8 SDD types, roles)
#   2. creates all 43 issues in docs/issue-import.csv order, so issue #N = SMS-N
#   3. closes the issues whose CSV State is "Done" (closing = Done state; no label)
#
# Idempotent-ish: existing labels are skipped; issues are only created if
# fewer than 43 open+closed issues exist. Re-running when issues already
# exist does nothing.

set -euo pipefail
REPO="setrios/salon-management-system"
CSV="docs/issue-import.csv"

# --- 1. labels --------------------------------------------------------------

mklabel() { # name color description
  gh label create "$1" --repo "$REPO" --color "$2" --description "$3" 2>/dev/null \
    || echo "label exists: $1"
}

# statuses (Done = closed, no label)
mklabel "status: backlog"     "ededed" "Not started, accepted into plan"
mklabel "status: in progress" "2a9cd0" "Active work"
mklabel "status: in review"   "9c3cd7" "Awaiting verification / validation"
mklabel "status: blocked"     "b60205" "Waiting on a dependency or gate decision"

# SDD types
mklabel "type: specification" "7057ff" "SRS sections, glossary, domain decisions"
mklabel "type: addendum"      "d93f0b" "New functionality via spec revision only"
mklabel "type: test"          "006b75" "Tests from BDD scenarios / acceptance criteria"
mklabel "type: feature"       "0e8a16" "Implementation ticket (cites REQ IDs)"
mklabel "type: verification"  "fbca04" "Agent self-check vs acceptance criteria"
mklabel "type: validation"    "e99695" "Human-only validation of built behavior"
mklabel "type: documentation" "fef2c0" "Docs, traceability matrix upkeep"
mklabel "type: gate"          "5319e7" "Human-only go/no-go decision, no code/test"

# roles
mklabel "role: coding agent" "c2e0c6" "Executed primarily by the coding agent"
mklabel "role: human"        "f9d0c4" "Executed by the human (student) only"
mklabel "role: joint"        "d4c5f9" "Agent drafts, human reviews/approves"

# --- 2. issues --------------------------------------------------------------

EXISTING=$(gh issue list --repo "$REPO" --state all --limit 1 --json number --jq 'length' 2>/dev/null || echo 0)
if [ "${EXISTING}" != "0" ]; then
  echo "Issues already exist (found $EXISTING) — refusing to create duplicates."
  echo "If this is wrong, adjust the guard or create the remaining issues manually"
  echo "in CSV order (issue #N must equal SMS-N)."
  exit 1
fi

n=0
tail -n +2 "$CSV" | python3 -c '
import csv, sys
for row in csv.reader(sys.stdin):
    if not row or not row[0].strip(): continue
    print("\x1e".join(row))   # record separator: one issue per line
' | while IFS= read -r line; do
  n=$((n+1))
  IFS=$'\x1e' read -r planid summary typ state role source deps desc <<<"$line"

  labels=()
  case "$typ" in Specification) labels+=("type: specification");; Addendum) labels+=("type: addendum");;
       Test) labels+=("type: test");; Feature) labels+=("type: feature");;
       Verification) labels+=("type: verification");; Validation) labels+=("type: validation");;
       Documentation) labels+=("type: documentation");; Gate) labels+=("type: gate");; esac
  case "$role" in "Coding Agent") labels+=("role: coding agent");;
       "Human (Student)") labels+=("role: human");; Joint) labels+=("role: joint");; esac
  # Done = closed, carried by the issue state and therefore by no label
  case "$state" in Backlog) labels+=("status: backlog");; "In Progress") labels+=("status: in progress");;
       "In Review") labels+=("status: in review");; Blocked) labels+=("status: blocked");;
       Done) ;; esac

  body="Source: ${source}
Blocked by: ${deps:-—}

${desc}

Role: ${role}
Plan state at creation: ${state}"

label_args=()
      for l in "${labels[@]}"; do
        label_args+=(--label "$l")
      done

      gh issue create --repo "$REPO" \
         --title "SMS-${n}: ${summary}" \
         --body "$body" \
         "${label_args[@]}" >/dev/null
  if [ "$state" = "Done" ]; then
    gh issue close "$n" --repo "$REPO" --reason completed >/dev/null
    echo "created #${n} (SMS-${n}): ${summary} — closed (Done)"
  else
    echo "created #${n} (SMS-${n}): ${summary}"
  fi
done

echo "Done: 43 issues created. Verify with: gh issue list --repo $REPO --limit 40"
