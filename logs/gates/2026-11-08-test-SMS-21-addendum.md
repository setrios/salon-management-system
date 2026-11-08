# TEST-GATE addendum — SMS-21 (S1.1 authentication tests)

| Field | Value |
|---|---|
| Gate | TEST-GATE addendum for SMS-21 / stage S1.1 |
| Supersedes | `logs/gates/2026-11-08-test-SMS-21.md` (SMS-21) — for the assertion count only |
| Date | 2026-11-08 |
| Signed by | `setrios`, 2026-11-08 |
| Decision | **SIGNED — GO** |

The signed record is not edited. This addendum records the one change made to
the test file after that signature, so the count in the signed `Basis` line and
in its §1 no longer describes the file as it stands.

## 1. What changed after the signature

`logs/gates/2026-11-08-test-SMS-21.md` approved 15 assertions. The sixteenth was
added to `tests/api/auth.test.ts` on the human's instruction after the signed
S1.1 control run found that one operation was logged under two `path` spellings
(`logs/runs/runs-02.md` §4):

| # | Assertion | Source |
|---|---|---|
| 16 | a login that succeeds and a login that fails are logged under the same contract `path`, `/api/v1/auth/login` | human instruction, 2026-11-08; `logs/runs/runs-02.md` §4 (the field is the join key of every run analysis); plan §8.3 |

It was written before the fix and failed on the second element
(`logs/tdd/tdd-SMS-21.md` §11.1), and the fix followed in
`src/middleware/logger.ts` (§11.2). The test commit is `59e46d5`; the
implementation commit is `33fffd2`. The re-run on the built artifact after the
fix is `logs/runs/runs-02.md` §2, "After the fix".

## 2. Scope

Nothing else in the signed record is superseded: the 15 assertions, D-18, D-19,
CL-09, the §7 implementation list and every other section stand as signed. This
addendum changes no operation, schema or status code the contract approves.

## 3. Decision

**SIGNED — GO.**

Signed by: setrios  Date: 2026-11-08
