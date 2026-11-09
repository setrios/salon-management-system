/**
 * S1.3 availability: P7 `getMasterAvailability` (public), M3 `getMyAvailability`
 * and M4 `replaceMyAvailability` (JWT-M). Exactly three operations.
 *
 * Source: REQ-F-015 (a master sets availability as a recurring weekly pattern,
 *         specific dates, or both, and both take effect for booking);
 *         REQ-F-031 (a multi-service duration is rounded up to the next
 *         30-minute boundary for occupancy: 75 becomes 90); REQ-NF-008 (all
 *         scheduling uses 30-minute slots, so no bookable start falls off a
 *         boundary); REQ-F-002 (a slot is inside availability); SCN-09 (weekly
 *         pattern plus one-off date); SCN-13 (75 minutes occupies a 90-minute
 *         block); POS-09, POS-13, POS-26, POS-27, NEG-14;
 *         spec/api/resource-model.md §5.1 (P7), §5.3 (M3, M4), §3 (timestamps
 *         are RFC 3339 with offset, Europe/Kyiv), §4 (`PUT` is a full
 *         replacement, used only here);
 *         spec/api/error-model.md §3 (400 for a missing or ill-typed query
 *         parameter, 404 for an unknown id, 415 for a non-JSON body, 422
 *         `VALIDATION_ERROR` for a schema violation and `BUSINESS_RULE_VIOLATION`
 *         for a semantically-valid rule that breaks a scheduling rule) and §4
 *         (401 = no credentials, 403 = authenticated but wrong role).
 * Contract: openapi.yaml#/paths/~1masters~1{masterId}~1availability
 *           openapi.yaml#/paths/~1me~1availability
 *           schemas Availability, WeeklyRule, DateRule, AvailabilityResponse,
 *           AvailabilitySlot; error bodies are validated against Problem.
 * Ticket: SMS-15 (Test)
 *
 * ---------------------------------------------------------------------------
 * Three decisions this file is written against, recorded for the TEST-GATE.
 *
 * 1. Time. Every date below is a literal. Nothing here reads the wall clock and
 *    nothing is computed from "today", so the file behaves identically on any
 *    day it is run: weekly rules name an ISO weekday, a date rule names a date,
 *    and P7 takes the date it should compute as a query parameter. This stage
 *    therefore needs no injected clock; the decision that S3.2 will need one is
 *    recorded in the gate, not pre-empted here.
 *
 * 2. Time zone. `startTime`/`endTime` in a rule are salon wall-clock, and the
 *    salon's zone is Europe/Kyiv (resource-model §3; REQ-NF-007 — one location,
 *    one zone, no selector anywhere in the contract). Slot instants are RFC 3339
 *    with the offset that zone has on that date: +02:00 in winter, +03:00 in
 *    summer. The two Monday dates below are one of each on purpose.
 *
 * 3. Occupancy at this stage. P7 computes slots from availability windows and
 *    the requested services' durations. It does NOT subtract booked
 *    appointments: there is no `appointments` table until S2.1. Consequently
 *    `available` is `true` for every slot here — that is the absence of bookings,
 *    not evidence that the stage asks whether a slot is free. S2.1 must revisit
 *    this file. See the TEST-GATE's "what this stage does not compute" line.
 *
 * The fixture writes staff accounts and nothing else. Services are created
 * through the S1.2 administrator operation and availability through M4 itself,
 * because a contract operation exists for each: arrangement uses the API where
 * the API can express it, and direct SQL only where no operation exists (the
 * two accounts, as in S1.1).
 */

import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { getSchemaValidator } from '../../src/contract/validators.js';
import { seedAccount } from '../helpers/accounts.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Minimal view of a supertest response; see `tests/api/auth.test.ts`. */
interface JsonResponse {
  readonly status: number;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, any>;
}

type SchemaValidator = ReturnType<typeof getSchemaValidator>;

/**
 * Fixed dates, chosen so the file does not depend on when it runs.
 *
 * WINTER_MONDAY and SUMMER_MONDAY are both ISO weekday 1, and Kyiv is +02:00 on
 * the first and +03:00 on the second — the same wall-clock window in two offsets
 * is what makes the zone observable. THURSDAY is the date SCN-09 uses for its
 * one-off override, and 2026-12-31 is a Thursday.
 */
const WINTER_MONDAY = '2026-12-07';
const SUMMER_MONDAY = '2027-07-05';
const THURSDAY = '2026-12-31';
const NEXT_MONDAY = '2026-12-14';

const WINTER_OFFSET = '+02:00';
const SUMMER_OFFSET = '+03:00';

/** `600` → `10:00`; minutes from midnight as the contract writes a wall clock. */
function hhmm(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const mins = (minutes % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

/**
 * The expected slot starts, every 30 minutes from `first` to `last` inclusive,
 * as the RFC 3339 instants the contract's own example is written in
 * (`2026-11-03T10:00:00+02:00`).
 */
function expectedStarts(date: string, offset: string, first: number, last: number): string[] {
  const starts: string[] = [];
  for (let minute = first; minute <= last; minute += 30) {
    starts.push(`${date}T${hhmm(minute)}:00${offset}`);
  }
  return starts;
}

const ADMIN = {
  username: 'admin-availability',
  password: 'admin-availability-password',
  fullName: 'Availability Administrator',
};

/** SCN-09's master: a weekly Monday pattern plus a one-off Thursday. */
const IHOR = {
  username: 'ihor-availability',
  password: 'ihor-availability-password',
  fullName: 'Ihor Availability',
};

/** SCN-13's master: the rounding case. */
const PETRO = {
  username: 'petro-availability',
  password: 'petro-availability-password',
  fullName: 'Petro Availability',
};

describe('S1.3 availability — P7, M3, M4', () => {
  const app = createApp();

  const isProblem = getSchemaValidator('Problem');
  const isAvailability = getSchemaValidator('Availability');
  const isAvailabilityResponse = getSchemaValidator('AvailabilityResponse');

  let adminToken = '';
  let ihorToken = '';
  let petroToken = '';
  let ihorId = '';
  let petroId = '';

  /** Service ids for the duration arithmetic: 45 + 30 = 75 → 90 occupied. */
  let service45 = '';
  let service30 = '';

  beforeAll(async () => {
    const admin = await seedAccount({
      role: 'admin',
      username: ADMIN.username,
      password: ADMIN.password,
      fullName: ADMIN.fullName,
    });
    const ihor = await seedAccount({
      role: 'master',
      username: IHOR.username,
      password: IHOR.password,
      fullName: IHOR.fullName,
    });
    const petro = await seedAccount({
      role: 'master',
      username: PETRO.username,
      password: PETRO.password,
      fullName: PETRO.fullName,
    });

    ihorId = ihor.id;
    petroId = petro.id;

    adminToken = await login(ADMIN.username, ADMIN.password);
    ihorToken = await login(IHOR.username, IHOR.password);
    petroToken = await login(PETRO.username, PETRO.password);

    expect(admin.id).toMatch(UUID_V4);

    service45 = await createService('Availability Haircut', 45);
    service30 = await createService('Availability Trim', 30);
  });

  async function login(username: string, password: string): Promise<string> {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ username, password });

    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  /** Creates a service through R6 and returns its id; the duration is the input. */
  async function createService(name: string, baseDurationMinutes: number): Promise<string> {
    const response = await request(app)
      .post('/api/v1/admin/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name, category: 'Hair', baseDurationMinutes });

    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  function expectProblem(
    response: JsonResponse,
    expected: { status: number; code: string },
  ): void {
    expect(response.status).toBe(expected.status);
    expect(response.headers['content-type']).toBe('application/problem+json');
    expect(isProblem(response.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);
    expect(response.body).toMatchObject({ status: expected.status, code: expected.code });
    expect(response.body.traceId).toMatch(UUID_V4);
    expect(response.body.instance).toBeDefined();
  }

  function expectJson(
    response: JsonResponse,
    expectedStatus: number,
    validate: SchemaValidator,
  ): void {
    expect(response.status).toBe(expectedStatus);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(validate(response.body), JSON.stringify(validate.errors ?? [])).toBe(true);
  }

  // ------------------------------------------------------- M3 / M4 transport

  async function getMyAvailability(token?: string): Promise<JsonResponse> {
    const pending = request(app).get('/api/v1/me/availability');
    return token === undefined ? pending : pending.set('Authorization', `Bearer ${token}`);
  }

  async function putAvailability(body: unknown, token?: string): Promise<JsonResponse> {
    const pending = request(app).put('/api/v1/me/availability').send(body as object);
    return token === undefined ? pending : pending.set('Authorization', `Bearer ${token}`);
  }

  /** Sets the caller's whole rule set through M4 and returns the stored body. */
  async function arrangeAvailability(
    token: string,
    weekly: unknown[],
    dates: unknown[] = [],
  ): Promise<Record<string, any>> {
    const response = await putAvailability({ weekly, dates }, token);
    expectJson(response, 200, isAvailability);
    return response.body;
  }

  /** Petro's Monday window, 10:00–18:00: the Given most P7 cases start from. */
  async function arrangeMondayWindow(): Promise<void> {
    await arrangeAvailability(petroToken, [
      { dayOfWeek: 1, startTime: '10:00', endTime: '18:00' },
    ]);
  }

  // ------------------------------------------------------------ P7 transport

  async function getSlots(
    masterId: string,
    date: string,
    serviceIds: string,
    token?: string,
  ): Promise<JsonResponse> {
    const pending = request(app)
      .get(`/api/v1/masters/${masterId}/availability`)
      .query({ date, serviceIds });
    return token === undefined ? pending : pending.set('Authorization', `Bearer ${token}`);
  }

  /** Sorted `startAt` instants, so a comparison never depends on response order. */
  function startsOf(response: JsonResponse): string[] {
    const slots = (response.body.slots ?? []) as { startAt: string }[];
    return slots.map((slot) => slot.startAt).sort();
  }

  // ====================================================== role matrix M3/M4

  describe('role on the caller-scoped operations (M3, M4)', () => {
    const VALID_BODY = {
      weekly: [{ dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }],
      dates: [],
    };

    it('M3 answers 401 without a token', async () => {
      expectProblem(await getMyAvailability(), { status: 401, code: 'UNAUTHENTICATED' });
    });

    it('M3 answers 403 FORBIDDEN for an administrator token', async () => {
      // The mirror of S1.2: there a master token was refused on /admin/*; here an
      // administrator token is refused on the master's own record. `/me/...` is
      // JWT-M, and `requireRole('master')` must not fall through for an admin.
      expectProblem(await getMyAvailability(adminToken), { status: 403, code: 'FORBIDDEN' });
    });

    it('M4 answers 401 without a token', async () => {
      expectProblem(await putAvailability(VALID_BODY), {
        status: 401,
        code: 'UNAUTHENTICATED',
      });
    });

    it('M4 answers 403 FORBIDDEN for an administrator token', async () => {
      expectProblem(await putAvailability(VALID_BODY, adminToken), {
        status: 403,
        code: 'FORBIDDEN',
      });
    });

    it('M3 answers 200 for the owning master', async () => {
      const response = await getMyAvailability(petroToken);
      expectJson(response, 200, isAvailability);
    });

    it('M4 answers 200 for the owning master', async () => {
      const response = await putAvailability(VALID_BODY, petroToken);
      expectJson(response, 200, isAvailability);
    });
  });

  // =============================================== round trip and replacement

  describe('M3 / M4 — full replacement of the rule set (REQ-F-015, POS-26)', () => {
    it('stores the weekly pattern and a date override, and returns them unchanged', async () => {
      const weekly = [{ dayOfWeek: 1, startTime: '10:00', endTime: '18:00' }];
      const dates = [{ date: THURSDAY, startTime: '12:00', endTime: '16:00' }];

      const stored = await arrangeAvailability(ihorToken, weekly, dates);
      expect(stored).toMatchObject({ weekly, dates });

      const read = await getMyAvailability(ihorToken);
      expectJson(read, 200, isAvailability);
      expect(read.body).toMatchObject({ weekly, dates });
    });

    it('replaces the previous set: a second PUT leaves only what it sent', async () => {
      await arrangeAvailability(ihorToken, [
        { dayOfWeek: 1, startTime: '10:00', endTime: '18:00' },
        { dayOfWeek: 2, startTime: '10:00', endTime: '12:00' },
      ]);

      const replacement = [{ dayOfWeek: 5, startTime: '09:00', endTime: '11:00' }];
      await arrangeAvailability(ihorToken, replacement, []);

      const read = await getMyAvailability(ihorToken);
      // Full replacement is the semantics `PUT` carries in resource-model §4 —
      // not a merge, so Monday and Tuesday are gone.
      expect(read.body).toMatchObject({ weekly: replacement });
    });

    it('accepts an empty rule set, clearing both collections', async () => {
      await arrangeAvailability(ihorToken, [
        { dayOfWeek: 1, startTime: '10:00', endTime: '18:00' },
      ]);
      await arrangeAvailability(ihorToken, [], []);

      const read = await getMyAvailability(ihorToken);
      expectJson(read, 200, isAvailability);
      expect(read.body).toEqual({ weekly: [], dates: [] });
    });

    it('returns both collections, empty, for a master who has never set any', async () => {
      // `weekly` and `dates` are required by the schema, so "nothing configured"
      // is two empty arrays rather than a 404: a master without availability has
      // no bookable slot, not a missing resource.
      const response = await getMyAvailability(petroToken);
      expectJson(response, 200, isAvailability);
      expect(response.body).toMatchObject({ weekly: [], dates: [] });
    });

    it('keeps each rule set private to its own master', async () => {
      await arrangeAvailability(petroToken, [
        { dayOfWeek: 3, startTime: '08:00', endTime: '09:00' },
      ]);

      const mine = await getMyAvailability(petroToken);
      const theirs = await getMyAvailability(ihorToken);

      expect(mine.body.weekly).toHaveLength(1);
      expect(theirs.body.weekly).toEqual([]);
    });

    it('is idempotent: the same PUT twice leaves the same set', async () => {
      const weekly = [{ dayOfWeek: 6, startTime: '09:00', endTime: '13:00' }];
      await arrangeAvailability(petroToken, weekly);
      const second = await arrangeAvailability(petroToken, weekly);

      expect(second).toMatchObject({ weekly, dates: [] });
    });
  });

  // ====================================================== M4 schema refusals

  describe('M4 — refusals that the contract defines (REQ-F-015)', () => {
    it('answers 422 VALIDATION_ERROR for a body with no weekly or dates property', async () => {
      const response = await putAvailability({}, petroToken);

      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'weekly', code: 'REQUIRED' })]),
      );
    });

    it('answers 422 UNKNOWN_FIELD for a property the schema does not declare', async () => {
      const response = await putAvailability(
        { weekly: [], dates: [], timeZone: 'Europe/Kyiv' },
        petroToken,
      );

      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'timeZone', code: 'UNKNOWN_FIELD' }),
        ]),
      );
    });

    it('answers 422 for a dayOfWeek outside the ISO range 1–7', async () => {
      const response = await putAvailability(
        { weekly: [{ dayOfWeek: 0, startTime: '09:00', endTime: '10:00' }], dates: [] },
        petroToken,
      );

      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'weekly[0].dayOfWeek' })]),
      );
    });

    it('answers 422 for a wall-clock time that is not HH:MM', async () => {
      const response = await putAvailability(
        { weekly: [{ dayOfWeek: 1, startTime: '9:00', endTime: '10:00' }], dates: [] },
        petroToken,
      );

      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'weekly[0].startTime' })]),
      );
    });

    it('answers 415 UNSUPPORTED_MEDIA_TYPE for a non-JSON body', async () => {
      const response = await request(app)
        .put('/api/v1/me/availability')
        .set('Authorization', `Bearer ${petroToken}`)
        .set('Content-Type', 'text/plain')
        .send('weekly=[]');

      expectProblem(response, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    });

    it('answers 422 BUSINESS_RULE_VIOLATION for a window whose end is not after its start', async () => {
      // The schema allows any HH:MM pair, so an inverted window is a schema-valid
      // body that breaks the rule a window carries. `M4` is one of the operations
      // error-model §3 lists for BUSINESS_RULE_VIOLATION, and this is the only
      // input of M4 that can reach the code it declares.
      const response = await putAvailability(
        { weekly: [{ dayOfWeek: 1, startTime: '18:00', endTime: '10:00' }], dates: [] },
        petroToken,
      );

      expectProblem(response, { status: 422, code: 'BUSINESS_RULE_VIOLATION' });
    });

    it('answers 422 BUSINESS_RULE_VIOLATION for a zero-length window', async () => {
      const response = await putAvailability(
        { weekly: [{ dayOfWeek: 1, startTime: '10:00', endTime: '10:00' }], dates: [] },
        petroToken,
      );

      expectProblem(response, { status: 422, code: 'BUSINESS_RULE_VIOLATION' });
    });
  });

  // ================================================= P7 — rounding (SCN-13)

  /**
   * Petro's Given for every P7 case: one Monday window, 10:00–18:00.
   *
   * `beforeEach`, not `beforeAll`: several cases narrow or open the window for
   * themselves, so each must start from the same set. It also keeps the file
   * honest under RED — a `beforeAll` that calls M4 would skip every case in the
   * block instead of failing it, and a skipped test is not RED evidence.
   */
  describe('P7 — duration arithmetic and 30-minute rounding (REQ-F-031, SCN-13)', () => {
    beforeEach(() => arrangeMondayWindow());

    it('sums the requested services before rounding: 45 + 30 is 75', async () => {
      const response = await getSlots(petroId, WINTER_MONDAY, `${service45},${service30}`);

      expectJson(response, 200, isAvailabilityResponse);
      expect(response.body).toMatchObject({
        masterId: petroId,
        date: WINTER_MONDAY,
        totalDurationMinutes: 75,
        occupiedDurationMinutes: 90,
      });
      // The contract fixes no order for `serviceIds`, so this is a set
      // comparison, not a positional one (the same rule the S1.2 gate applies to
      // list responses).
      expect([...response.body.serviceIds].sort()).toEqual([service30, service45].sort());
    });

    it('occupies 90 minutes for the 75-minute total (SCN-13)', async () => {
      const response = await getSlots(petroId, WINTER_MONDAY, `${service45},${service30}`);
      const slots = response.body.slots as { durationMinutes: number }[];

      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every((slot) => slot.durationMinutes === 90)).toBe(true);
    });

    it('leaves an already-aligned total unrounded: 45 + 45 is 90', async () => {
      const second = await createService('Availability Cut', 45);
      const response = await getSlots(petroId, WINTER_MONDAY, `${service45},${second}`);

      expect(response.body).toMatchObject({
        totalDurationMinutes: 90,
        occupiedDurationMinutes: 90,
      });
    });

    it('rounds a single 45-minute service up to 60', async () => {
      const response = await getSlots(petroId, WINTER_MONDAY, service45);

      expect(response.body).toMatchObject({
        totalDurationMinutes: 45,
        occupiedDurationMinutes: 60,
      });
    });
  });

  // ============================================ P7 — slots and NF-008 (POS-27)

  describe('P7 — slot starts and the boundary rule (REQ-NF-008, POS-27)', () => {
    beforeEach(() => arrangeMondayWindow());

    it('starts every slot on a 30-minute boundary', async () => {
      const response = await getSlots(petroId, WINTER_MONDAY, `${service45},${service30}`);

      const minutes = startsOf(response).map((start) => start.slice(14, 16));
      expect(minutes.length).toBeGreaterThan(0);
      expect([...new Set(minutes)].every((minute) => minute === '00' || minute === '30')).toBe(
        true,
      );
    });

    it('offers a slot at every 30-minute start that a 90-minute block still fits in', async () => {
      // The window is 10:00–18:00 and the block is 90 minutes, so the last start
      // is 16:30: 16:30 + 90 = 18:00. Fourteen starts, none of them past the end.
      const response = await getSlots(petroId, WINTER_MONDAY, `${service45},${service30}`);

      expect(startsOf(response)).toEqual(
        expectedStarts(WINTER_MONDAY, WINTER_OFFSET, 10 * 60, 16 * 60 + 30),
      );
    });

    it('ends each slot 90 minutes after its start', async () => {
      const response = await getSlots(petroId, WINTER_MONDAY, `${service45},${service30}`);
      const slots = response.body.slots as { startAt: string; endAt: string }[];

      expect(slots.length).toBe(14);
      expect(slots[0]).toMatchObject({
        startAt: `${WINTER_MONDAY}T10:00:00${WINTER_OFFSET}`,
        endAt: `${WINTER_MONDAY}T11:30:00${WINTER_OFFSET}`,
      });
    });

    it('snaps starts to the boundary when a window opens off it', async () => {
      // REQ-NF-008 constrains starts, not windows: a window may open at 10:15,
      // and the first bookable start is then 10:30. Without the snapping, the
      // 10:15 start would violate "no bookable start time falls outside a
      // 30-minute boundary".
      await arrangeAvailability(petroToken, [
        { dayOfWeek: 1, startTime: '10:15', endTime: '13:00' },
      ]);

      const response = await getSlots(petroId, WINTER_MONDAY, `${service45},${service30}`);

      expect(startsOf(response)).toEqual(
        expectedStarts(WINTER_MONDAY, WINTER_OFFSET, 10 * 60 + 30, 11 * 60 + 30),
      );
    });

    it('returns no slot when the window is shorter than the occupied block', async () => {
      await arrangeAvailability(petroToken, [
        { dayOfWeek: 1, startTime: '10:00', endTime: '11:00' },
      ]);

      const response = await getSlots(petroId, WINTER_MONDAY, `${service45},${service30}`);

      expectJson(response, 200, isAvailabilityResponse);
      expect(response.body.slots).toEqual([]);
    });
  });

  // ==================================== P7 — weekly vs date (SCN-09, F-015)

  describe('P7 — a weekly pattern and a date override (REQ-F-015, SCN-09)', () => {
    beforeEach(() =>
      arrangeAvailability(
        ihorToken,
        [{ dayOfWeek: 1, startTime: '10:00', endTime: '18:00' }],
        [{ date: THURSDAY, startTime: '12:00', endTime: '16:00' }],
      ),
    );

    it('offers slots on the weekly weekday', async () => {
      const response = await getSlots(ihorId, WINTER_MONDAY, service30);

      expectJson(response, 200, isAvailabilityResponse);
      expect(startsOf(response)).toEqual(
        expectedStarts(WINTER_MONDAY, WINTER_OFFSET, 10 * 60, 17 * 60 + 30),
      );
    });

    it('offers the one-off date even though its weekday has no weekly rule', async () => {
      // SCN-09: the override is on a Thursday, the pattern names Mondays. The
      // override alone makes 2026-12-31 bookable between 12:00 and 16:00.
      const response = await getSlots(ihorId, THURSDAY, service30);

      expectJson(response, 200, isAvailabilityResponse);
      expect(startsOf(response)).toEqual(
        expectedStarts(THURSDAY, WINTER_OFFSET, 12 * 60, 15 * 60 + 30),
      );
    });

    it('replaces the weekly window on a date that carries an override', async () => {
      // The `dates` schema description is explicit: "a date rule replaces the
      // weekly rule for that date". 2026-12-14 is a Monday, so the weekly
      // 10:00–18:00 would apply — the override narrows it to 10:00–12:00.
      await arrangeAvailability(
        ihorToken,
        [{ dayOfWeek: 1, startTime: '10:00', endTime: '18:00' }],
        [{ date: NEXT_MONDAY, startTime: '10:00', endTime: '12:00' }],
      );

      const overridden = await getSlots(ihorId, NEXT_MONDAY, service30);
      const plain = await getSlots(ihorId, WINTER_MONDAY, service30);

      expect(startsOf(overridden)).toEqual(
        expectedStarts(NEXT_MONDAY, WINTER_OFFSET, 10 * 60, 11 * 60 + 30),
      );
      // The neighbouring Monday without an override keeps the full window, so the
      // replacement is scoped to the date and not to the weekday.
      expect(startsOf(plain)).toHaveLength(16);
    });

    it('offers no slot on a weekday the pattern does not name', async () => {
      const response = await getSlots(ihorId, '2026-12-08', service30);

      expectJson(response, 200, isAvailabilityResponse);
      expect(response.body.slots).toEqual([]);
    });
  });

  // ======================================== P7 — the salon's time zone is Kyiv

  describe("P7 — slot instants carry the salon's offset (Europe/Kyiv)", () => {
    beforeEach(() => arrangeMondayWindow());

    it('writes winter instants with +02:00', async () => {
      const response = await getSlots(petroId, WINTER_MONDAY, service30);

      expect(startsOf(response)[0]).toBe(`${WINTER_MONDAY}T10:00:00+02:00`);
    });

    it('writes summer instants with +03:00 for the same wall clock', async () => {
      // 2027-07-05 is a Monday too, so the same weekly rule produces the same
      // wall-clock starts — with the summer offset. A UTC-normalising
      // implementation would pass the winter case and fail this one.
      const response = await getSlots(petroId, SUMMER_MONDAY, service30);

      expect(startsOf(response)[0]).toBe(`${SUMMER_MONDAY}T10:00:00+03:00`);
    });
  });

  // ================================================ P7 — public, and refusals

  describe('P7 — public access and refusals', () => {
    beforeEach(() => arrangeMondayWindow());

    it('answers without any token: the operation is public', async () => {
      // `security: []` on the operation and no `/admin` or `/me` prefix. The
      // client books without an account (SRS §2 Actors), so this must not be
      // behind either gate — including behind the administrator token the rest
      // of S1.2 requires.
      const response = await getSlots(petroId, WINTER_MONDAY, service30);

      expectJson(response, 200, isAvailabilityResponse);
    });

    it('answers 404 NOT_FOUND for an unknown master id', async () => {
      const response = await getSlots(randomUUID(), WINTER_MONDAY, service30);

      expectProblem(response, { status: 404, code: 'NOT_FOUND' });
    });

    it('answers 404 NOT_FOUND for an unknown service id', async () => {
      // A service id that names no service is an unknown resource, which
      // error-model §3 assigns to 404 — P7 is in that list.
      const response = await getSlots(petroId, WINTER_MONDAY, randomUUID());

      expectProblem(response, { status: 404, code: 'NOT_FOUND' });
    });

    it('answers 400 MALFORMED_REQUEST when date is absent', async () => {
      const response = await request(app)
        .get(`/api/v1/masters/${petroId}/availability`)
        .query({ serviceIds: service30 });

      expectProblem(response, { status: 400, code: 'MALFORMED_REQUEST' });
    });

    it('answers 400 MALFORMED_REQUEST when serviceIds is absent', async () => {
      const response = await request(app)
        .get(`/api/v1/masters/${petroId}/availability`)
        .query({ date: WINTER_MONDAY });

      expectProblem(response, { status: 400, code: 'MALFORMED_REQUEST' });
    });

    it('answers 400 MALFORMED_REQUEST for a date that is not a calendar date', async () => {
      const response = await getSlots(petroId, 'not-a-date', service30);

      expectProblem(response, { status: 400, code: 'MALFORMED_REQUEST' });
    });

    it('answers 400 MALFORMED_REQUEST for a serviceIds entry that is not a uuid', async () => {
      const response = await getSlots(petroId, WINTER_MONDAY, 'not-a-uuid');

      expectProblem(response, { status: 400, code: 'MALFORMED_REQUEST' });
    });

    it('answers 200 with no slots for a date with no availability at all', async () => {
      // A master who has never set availability is not a 404: the resource exists
      // and its slot set is empty. 2027-07-06 is a Tuesday with no rule.
      const empty = await seedAccount({
        role: 'master',
        username: `empty-${randomUUID().slice(0, 8)}`,
        password: 'empty-availability-password',
        fullName: 'Empty Availability',
      });

      const response = await getSlots(empty.id, '2027-07-06', service30);

      expectJson(response, 200, isAvailabilityResponse);
      expect(response.body.slots).toEqual([]);
      expect(response.body).toMatchObject({ masterId: empty.id, totalDurationMinutes: 30 });
    });
  });

  // ================================================ what "available" means here

  describe('P7 — occupancy is not computed at this stage', () => {
    it('marks every slot available, because no appointment can exist yet', async () => {
      // This is a statement about the stage, not about bookings. `appointments`
      // arrives in S2.1; until then nothing can make a slot unavailable, so the
      // field the schema requires is a constant. S2.1 must replace this
      // assertion with the real subtraction — reading it as "slots are free of
      // appointments" today would be wrong. TEST-GATE records the same line.
      await arrangeAvailability(petroToken, [
        { dayOfWeek: 1, startTime: '10:00', endTime: '18:00' },
      ]);

      const response = await getSlots(petroId, WINTER_MONDAY, `${service45},${service30}`);
      const slots = response.body.slots as { available: boolean }[];

      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every((slot) => slot.available === true)).toBe(true);
    });
  });
});
