/**
 * Availability — P7, M3 and M4.
 *
 *   P7 GET  /masters/{masterId}/availability   getMasterAvailability  (public)
 *   M3 GET  /me/availability                   getMyAvailability      (JWT-M)
 *   M4 PUT  /me/availability                   replaceMyAvailability  (JWT-M)
 *
 * Source: REQ-F-015 (weekly pattern, date overrides, or both), REQ-F-031 (the
 *         occupied block rounds up to 30 minutes), REQ-NF-008 (no start off the
 *         boundary), REQ-F-002 (a slot lies inside availability), SCN-09,
 *         SCN-13; `error-model.md` §3 (400 for a missing or ill-typed query
 *         parameter, 404 for an unknown id, 422 `VALIDATION_ERROR` for a schema
 *         violation and `BUSINESS_RULE_VIOLATION` for a self-contradictory
 *         window), §4 (401 = no credentials, 403 = authenticated but wrong
 *         role); resource-model §4 (`PUT` = full replacement), §5.1, §5.3.
 * Contract: openapi.yaml#/paths/~1masters~1{masterId}~1availability,
 *           ~1me~1availability; schemas Availability, AvailabilityResponse.
 *
 * Two boundaries this file must not cross, both fixed by the SMS-15 gate:
 *
 *   - **G4** — two windows on one weekday that overlap are *undefined*: union,
 *     intersection and rejection are all defensible and no document chooses. No
 *     validation here rejects them. `lib/availability.ts` enumerates both and
 *     de-duplicates identical starts, which is the minimum needed to answer at
 *     all; that choice is recorded in the gate and in `tdd-SMS-24.md` §11.
 *   - **G13** — P7 declares 422 and has no trigger at this stage. Nothing here
 *     invents one: an unknown service id is 404 (both before and after S2.1), a
 *     service the master does not offer is not checked at all. 422 stays
 *     unreachable until S2.1 names a rule.
 */

import { Router, type Request, type Response } from 'express';

import { HttpProblem } from '../../middleware/error-handler.js';
import { type Principal } from '../../middleware/auth.js';
import { masterAccess } from '../../middleware/authorize.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import {
  roundUpToBlock,
  slotsFor,
  totalMinutes,
  type AvailabilityInput,
  type MinuteInterval,
} from '../../lib/availability.js';
import { MINUTES_PER_DAY, instantAt, minutesOnDate } from '../../lib/occupancy.js';
import { parseCalendarDate } from '../../lib/time.js';
import { windowViolations } from './rules.js';
import {
  findServiceDurations,
  masterExists,
  readAvailability,
  replaceAvailability,
  unofferedServiceIds,
} from './service.js';
import { bookedBlocks } from '../appointments/service.js';
import { asyncRoute, sendJson } from '../reference-data/http.js';

/**
 * Splits the CSV `serviceIds` parameter (contract: `type: string`, "Comma-
 * separated service ids") into entries, dropping empty segments.
 */
function splitServiceIds(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
}

/** `res.locals` shape published by `validateParams` for P7. */
interface SlotsQuery {
  readonly date: string;
  readonly serviceIds: string;
}

/** A `uuid`, as `AvailabilityResponse.serviceIds[].format` requires. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** P7 — slots for one date, computed from the rules and the requested services. */
async function getMasterAvailabilityHandler(_req: Request, res: Response): Promise<void> {
  const { masterId } = res.locals.params as { masterId: string };
  const query = res.locals.query as SlotsQuery;

  if (!(await masterExists(masterId))) {
    throw new HttpProblem('NOT_FOUND', 'No master is defined with this id.');
  }

  const serviceIds = splitServiceIds(query.serviceIds);
  if (!serviceIds.every((id) => UUID.test(id))) {
    // An entry that is not a uuid is an ill-typed query parameter, which
    // error-model §3 puts at 400 and P7 declares.
    throw new HttpProblem(
      'MALFORMED_REQUEST',
      'serviceIds must be a comma-separated list of uuids.',
    );
  }

  const durations = await findServiceDurations(serviceIds);
  if (durations.length !== serviceIds.length) {
    // A uuid that names no service is an unknown id, which §3 puts at 404 for
    // P7. This is NOT the declared 422 (gate §5 G13).
    throw new HttpProblem('NOT_FOUND', 'No service is defined with this id.');
  }

  // D5: the 422 P7 declares and had no trigger for at S1.3. A service that
  // exists but is not linked to this master (or whose link is retired) is a
  // schema-valid request for something that is not the master's to book.
  const unoffered = await unofferedServiceIds(masterId, serviceIds);
  if (unoffered.length > 0) {
    throw new HttpProblem(
      'BUSINESS_RULE_VIOLATION',
      'The master does not offer every requested service.',
    );
  }

  const total = totalMinutes(durations.map((duration) => duration.baseDurationMinutes));
  const occupied = roundUpToBlock(total);
  const availability = await readAvailability(masterId);

  sendJson(res, 200, 'AvailabilityResponse', {
    masterId,
    date: query.date,
    serviceIds,
    totalDurationMinutes: total,
    occupiedDurationMinutes: occupied,
    slots: slotsFor(query.date, availability, occupied, await bookedOn(masterId, query.date)),
  });
}

/**
 * The day's booked blocks as wall-clock minutes on `date`.
 *
 * A booking can start the previous evening and reach into this date (or start
 * here and end after midnight), so the query takes the whole day widened by a
 * day on each side and the conversion to minutes is deliberately unbounded
 * (`minutesOnDate`): a block that began at 23:00 yesterday is negative, and one
 * that ends at 00:30 tomorrow is past 1440. Clamping either side would turn an
 * overlap into a gap.
 */
async function bookedOn(masterId: string, dateKey: string): Promise<MinuteInterval[]> {
  const date = parseCalendarDate(dateKey);
  if (date === null) return [];

  const dayStart = instantAt(date, 0);
  const blocks = await bookedBlocks(
    masterId,
    new Date(dayStart.getTime() - MINUTES_PER_DAY * 60_000),
    new Date(dayStart.getTime() + MINUTES_PER_DAY * 60_000),
  );

  return blocks.map((block) => ({
    start: minutesOnDate(date, block.start),
    end: minutesOnDate(date, block.end),
  }));
}

/** M3 — the caller's own rule set; two empty arrays when none was ever set. */
async function getMyAvailabilityHandler(_req: Request, res: Response): Promise<void> {
  const principal = res.locals.principal as Principal;
  sendJson(res, 200, 'Availability', await readAvailability(principal.id));
}

/** M4 — a full replacement of both collections. */
async function replaceMyAvailabilityHandler(_req: Request, res: Response): Promise<void> {
  const principal = res.locals.principal as Principal;
  const body = res.locals.body as AvailabilityInput;

  const violations = windowViolations(body);
  if (violations.length > 0) {
    // Decision (a) from the SMS-15 gate: an inverted or zero-length window is
    // self-contradictory input, so it is the business rule M4 declares. Two
    // overlapping windows are NOT rejected — they are undefined (gate §5 G4),
    // and `windowViolations` does not look at them.
    throw new HttpProblem('BUSINESS_RULE_VIOLATION', 'Every window must end after it starts.');
  }

  sendJson(res, 200, 'Availability', await replaceAvailability(principal.id, body));
}

/** Registers P7 (public) and M3/M4 (JWT-M) on the API router. */
export function availabilityRoutes(router: Router): void {
  router.get(
    '/masters/:masterId/availability',
    validateParams('getMasterAvailability'),
    asyncRoute(getMasterAvailabilityHandler),
  );

  router.get('/me/availability', ...masterAccess, asyncRoute(getMyAvailabilityHandler));

  router.put(
    '/me/availability',
    ...masterAccess,
    validateBody('replaceMyAvailability'),
    asyncRoute(replaceMyAvailabilityHandler),
  );
}
