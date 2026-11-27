# Traceability matrix — completion and automated audit (SMS-65)

| | |
|---|---|
| Ticket | SMS-65 (lab 6, steps 11–12) |
| Matrix | `spec/traceability-matrix.md` (`92201a3`) |
| Generator and audit | `scripts/traceability.mjs`; `npm run check:traceability` (`a0cd5cb`) |
| Date | 2026-11-27 |
| Approved by | setrios, 2026-11-27 — T-1, T-2, T-3 accepted (recorded by the coding agent at the developer's instruction) |

## 1. How the matrix is built

SRS v1.3 §8 left the Test, Code and Doc columns empty for later stages, and the
links had since spread across many artifacts. A matrix filled in by hand would
be out of date at the next commit, so it is **generated from the artifacts
themselves** — every cell is derived, and regenerating it is the check:

| Column | Derived from |
|---|---|
| Requirement, acceptance criterion, scenario, first ticket | SRS v1.3 §8 (42 rows) and addendum 001 (REQ-F-034) |
| Tickets | that, `docs/ticket-list.md`'s coverage table, and the `Ticket:` line of every test citing the requirement |
| Tests | the test files (`tests/api`, `acceptance`, `ui`, `tooling`) whose header cites the requirement |
| Code | the module registering each operation `resource-model.md` §5 traces to the requirement, and the source files whose header cites it |
| Interface | the screens of `spec/ui/screens.md` whose *Requirements* cite it |
| Documentation | the user-guide section of each of those screens, the API reference for its operations, and recorded entries for requirements no screen shows |

## 2. What the audit checks

| # | Check |
|---|---|
| A1 | every requirement has every cell, or a reason recorded in the script (empty by design) |
| A2 | every requirement id cited in `src/`, `tests/`, `scripts/` and the living documents is defined by the SRS or an addendum |
| A3 | every test file cites a requirement or a scenario, or is recorded as tracing to another source |
| A4–A6 | every ticket, scenario, screen and user-guide section the matrix names exists |
| A7 | every one of the 50 operations is registered by a module |

## 3. What the first runs found

| Run | Findings | Reading |
|---|---|---|
| 1 | 7 | 3 interface cells empty (REQ-F-017, 024, 026), REQ-NF-002 without code — **the generator's own parsing**: an abbreviated id at the end of a cell (`REQ-F-012, 017`) was dropped, and the stylesheet that implements REQ-NF-002 was not read. Fixed in the generator |
| 2 | 3 | but REQ-F-001's row listed reminder and cancellation tests: the parser read "addendum **001**" and "a **200**" after a requirement as REQ-F-001 and REQ-F-200. **Rewritten**: a bare number continues a list only when nothing but `,` `;` `and` or space separates it from the id before it — checked on seven sample strings |
| 3 | 4 | the real ones below, plus the generator's own example id in a comment (excluded) |

The real findings:

| # | Finding | Disposition |
|---|---|---|
| T-1 | REQ-F-034 had no screen: `screens.md` §7 says it is "shown as status `cancelled` in A3 **Reminders**", and the interface does show *Cancelled — not sent*, but A3's *Requirements* did not list it | `screens.md` A3 lists REQ-F-034 (`cbe8741`) — the specification made consistent with itself |
| T-2 | `tests/api/structural.test.ts` cites no requirement | its source is the error model and the HTTP plumbing (404/405/415, the `Problem` shape, trace ids, the log line — `error-model.md` §3, lab 5 step 1), not an SRS requirement; **recorded as tracing to that source** rather than tied to a requirement it does not test |
| T-3 | `tests/api/error-log.test.ts` cites no requirement | its source is logging (lab 5 step 1; F12, SMS-75); **recorded the same way** |

After them: **0 findings** — 43 requirements, 39 test files, 50 / 50 operations
registered.

## 4. The audit can fail

Two defects were injected and the audit run with `--check`: an undefined id
(`REQ-F-099`) in a test's header, and the requirements removed from screen A9's
row.

```
A1 empty cell: REQ-F-022: no interface
A1 empty cell: REQ-F-032: no interface
A1 empty cell: REQ-F-033: no interface
A2 unknown id: tests/api/rounding.test.ts: REQ-F-099 is not defined by the SRS or an addendum
exit: 1
```

Both files restored: 0 findings, exit 0.

## 5. The developer's decisions

| # | Decision |
|---|---|
| T-1 | **Accepted**: screen A3 lists REQ-F-034 |
| T-2 | **Accepted**: `structural.test.ts` traces to the error model and the HTTP plumbing, recorded in the script |
| T-3 | **Accepted**: `error-log.test.ts` traces to the logging requirement of lab 5, recorded in the script |

With them the matrix has no open finding: `npm run check:traceability` exits 0.
