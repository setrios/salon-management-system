# Log samples

`app-sample.jsonl` is ten real records written by the application — not a
mock-up. They were produced by `logs/runtime/s47-log-sample.mjs` against a
scratch database (`salon_s47_log_sample`, created and dropped by the script), on
the built artifact, and copied here unchanged.

| | |
|---|---|
| Format | one JSON object per line, appended to `<LOG_DIR>/app-YYYY-MM-DD.jsonl` |
| Writer | `src/middleware/logger.ts` — own implementation, no logging dependency (D-6) |
| Reader | `logs/runs/runs-*.md` quote control-run records verbatim |
| Regenerate | `npm run build && node --env-file-if-exists=.env logs/runtime/s47-log-sample.mjs` |

## The fields

| Field | Meaning |
|---|---|
| `ts` | when the record was written, ISO 8601 UTC with milliseconds |
| `level` | `info` for a 2xx/3xx, `warn` for a 4xx, `error` for a 5xx (`levelFor`) |
| `event` | the record's kind — `http.request` for the access log, plus operational events such as `server.started`, `server.stopping`, `reminders.tick-failed` |
| `traceId` | the correlation id `traceMiddleware` assigned; the same value appears in the response header and in the `Problem.traceId` of an error |
| `method`, `path`, `status`, `durationMs` | the request, the resolved path, the status and the handler time |

## The paths, which are the interesting part

`path` never carries a concrete parameter value, because a parameter can hold a
client's access token (REQ-NF-001, REQ-NF-006). Resolution order
(`requestLogger`): the contract template → the Express route → the raw path.

| Record | Shows |
|---|---|
| `POST /api/v1/auth/login` 200 `info` | a template containing no parameter |
| `GET /health` 200 `info` | a route outside `/api/v1`, which no template claims |
| `GET /api/v1/admin/appointments` 401 `warn` | the level mapping, and a template with no parameter |
| `POST /api/v1/admin/services` 422 `warn` | a validation refusal logged at `warn` |
| `GET /api/v1/admin/appointments/{appointmentId}` 404 `warn` | a path parameter replaced by its template |
| `GET /api/v1/no-such-operation` 404 `warn` | a path with no template: the raw path is logged, and it cannot carry a token because no contract path claims it |
| `DELETE /api/v1/admin/services` 405 `warn` | a defined path with an undefined method |
| `POST /api/v1/admin/services` 201 `info` | a create |
| `POST /api/v1/admin/appointments` 201 `info` | a create with a body |
| `GET /api/v1/appointments/{token}` 200 `info` | **the token's template, not the token** — the reason the resolution order exists |

## What the sample does not contain

- **A 5xx record.** The run does not provoke one; the level mapping is
  `levelFor`'s, and the 500 path is asserted in `tests/api/structural.test.ts`.
- **`server.started` / `server.stopping`.** Those are written by `src/index.ts`,
  not by `createApp()`, and the run mounts the app over a socket without the
  process entry point.
- **Real client data.** The run's client is a fixture (`Sample Client`,
  `+380501234567`); production records carry real values, which is why the logs
  directory is git-ignored (`logs/runtime/`) and only samples are committed.
