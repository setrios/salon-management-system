/**
 * S2.3 client cancellation — P10 `cancelAppointmentByToken`.
 *
 *   P10 POST /appointments/{token}/cancel
 *       cancelAppointmentByToken   (public, `security: []`)
 *
 * Source: REQ-F-006 ("The client can cancel the appointment via the link, free of
 *         charge, with no restriction on notice period"; AC: "Cancelling at any
 *         time, including minutes before the appointment, succeeds without a fee
 *         or error" — SRS v1.3 lines 454–458), REQ-NF-005 (history is not
 *         rewritten), SCN-02 ("the appointment status becomes `cancelled`");
 *         `error-model.md` §3.1 (the state-transition table, which the document
 *         calls "the authority … for the state rules in D15"): `confirmed` → 200
 *         `cancelled`, `cancelled` → 200 unchanged, `completed` → 409
 *         `INVALID_STATE_TRANSITION`; `resource-model.md:165` (POST actions are
 *         idempotent in effect); SRS v1.3 lines 253–256 (no cancellation SMS for
 *         the client) and 397–400 (cancellation alerts are to master and
 *         administrator — SMS-30, not this stage);
 *         `resource-model.md` §5.1 (P10's response set).
 * Contract: openapi.yaml#/paths/~1appointments~1{token}~1cancel; schemas
 *           Appointment, Reminder, Problem.
 *
 * ---------------------------------------------------------------------------
 * Decisions this file is written against (S2.3 inventory, F1–F7):
 *
 *   F1  A repeat cancellation is **200 with the record unchanged**, not 409.
 *       The contract's own description (openapi.yaml:428–430,
 *       error-model.md:186–196, resource-model.md:165) says so; the 409 in P10's
 *       declared set is for cancelling a **completed** appointment. K2 and K3
 *       are the two cells of that table this stage owns.
 *   F2  Reminders on a cancelled record are **not asserted** and not changed:
 *       SRS v1.3 does not define them, contract's P10 example shows `skipped`,
 *       the code currently computes `scheduled`, and plan decision D-11
 *       (logs/2026-11-08-implementation-plan.md:85) sends the decision to an
 *       addendum, not to code. This file therefore asserts nothing about
 *       `reminders[]` after cancellation; the gap is register row 3.
 *   F3  A `completed` record is arranged out of band, by one `update`, because
 *       the operation that produces that state (R23, `completeAppointment`) is
 *       SMS-34 / S5.3. This is arrangement, not an assertion about storage —
 *       K3's subject is P10's answer for such a record. The `update` is the
 *       direct write that R23 replaces when S5.3 lands.
 *   F4  P10 takes no advisory lock. Cancellation only frees a block; it never
 *       takes one, so it cannot create a double booking. The guarantee that a
 *       freed slot is bookable again is the partial unique index
 *       `appointments_master_start_unique` (`where status <> 'cancelled'`).
 *   F5  A first cancellation writes `updated_at`; a repeat writes nothing. The
 *       `update` is guarded by `status = 'confirmed'`, so a second call affects
 *       zero rows and answers the current state. K2 reads under a **later**
 *       clock so that a rewrite of `updated_at` would be visible.
 *   F6  The transition table of error-model.md §3.1 lives in a new pure module,
 *       `src/modules/appointments/state.ts`; `routes.ts`/`service.ts` are only
 *       modified. `check:test-first` therefore proves ordering for `state.ts`
 *       alone (manifest entry below).
 *   F7  Cancelling an appointment whose `startAt` is in the past is allowed:
 *       REQ-F-006's AC says "at any time", and P10 has no notice period to
 *       check. K8 books a future record, moves it into the past out of band
 *       (CL-11 refuses a past start through P8) and cancels it.
 *
 * What this file does *not* assert:
 *
 *   - **A cancellation message.** SRS v1.3 lines 253–256: "No additional SMS is
 *     sent specifically for cancellation — the client sees the updated status on
 *     the confirmation page". K6 asserts the **absence** for every audience;
 *     the master's and administrator's alerts are SMS-30 (SRS line 400).
 *   - **The `reminders[]` of a cancelled record** — see F2.
 *   - **A cancellation fee.** No field carries one; REQ-F-006's AC is tested as
 *     "the price the booking reported is the price the cancelled record reports".
 */

import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { getSchemaValidator } from '../../src/contract/validators.js';
import { getPool } from '../../src/db/client.js';
import {
  arrangeAdmin,
  arrangeLink,
  arrangeMaster,
  arrangeService,
  unique,
  type AdminFixture,
  type MasterFixture,
  type ServiceFixture,
} from '../helpers/booking.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Minimal view of a supertest response; see `tests/api/auth.test.ts`. */
interface JsonResponse {
  readonly status: number;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, any>;
}

/** The instant the application treats as "now" (D9); Kyiv is +02:00 in November. */
const NOW = '2026-11-12T09:00:00+02:00';

/** Two hours later — used by K2 so that a rewrite of `updated_at` is visible. */
const LATER = '2026-11-12T11:00:00+02:00';

/** A Monday three weeks after NOW. */
const FAR_MONDAY = '2026-12-07';
const WINTER_OFFSET = '+02:00';

/** A Monday a week before NOW: the past start of K8. */
const PAST_MONDAY = '2026-11-09';

function onMonday(time: string): string {
  return `${FAR_MONDAY}T${time}:00${WINTER_OFFSET}`;
}

function onPastMonday(time: string): string {
  return `${PAST_MONDAY}T${time}:00${WINTER_OFFSET}`;
}

describe('S2.3 client cancellation — P10 cancelAppointmentByToken', () => {
  const app = createApp({ now: () => new Date(NOW) });

  const isProblem = getSchemaValidator('Problem');
  const isAppointment = getSchemaValidator('Appointment');

  let admin: AdminFixture;

  /** A master with one 30-minute service, working Mondays 10:00–18:00. */
  interface Bookable {
    readonly master: MasterFixture;
    readonly service: ServiceFixture;
  }

  async function arrangeBookable(label: string): Promise<Bookable> {
    const master = await arrangeMaster(app, unique(label));
    const service = await arrangeService(app, admin.token, {
      name: unique(`${label} service`),
      baseDurationMinutes: 30,
    });
    await arrangeLink(app, admin.token, master.id, service.id, 45000);
    // M4 replaces the whole rule set (resource-model §4), so this is one PUT.
    // Monday 10:00–18:00 covers the future start every case books.
    const windows = await request(app)
      .put('/api/v1/me/availability')
      .set('Authorization', `Bearer ${master.token}`)
      .send({
        weekly: [{ dayOfWeek: 1, startTime: '10:00', endTime: '18:00' }],
        dates: [],
      });
    expect(windows.status).toBe(200);
    return { master, service };
  }

  /** Books one service through P8 and returns the 201 response. */
  async function book(
    bookable: Bookable,
    startAt: string = onMonday('10:00'),
  ): Promise<JsonResponse> {
    return request(app)
      .post('/api/v1/appointments')
      .send({
        client: { name: 'Iryna Kovalenko', phone: '+380501234567' },
        masterId: bookable.master.id,
        serviceIds: [bookable.service.id],
        startAt,
      });
  }

  /** P10, with no `Authorization` header — the token is the credential. */
  async function cancel(token: string, application = app): Promise<JsonResponse> {
    return request(application).post(`/api/v1/appointments/${token}/cancel`);
  }

  /** P9, with no `Authorization` header — used to read the record back. */
  async function getByToken(token: string, application = app): Promise<JsonResponse> {
    return request(application).get(`/api/v1/appointments/${token}`);
  }

  /** P7: the day's offered starts for one master and one service. */
  async function getSlots(bookable: Bookable, date: string): Promise<string[]> {
    const response = await request(app)
      .get(`/api/v1/masters/${bookable.master.id}/availability`)
      .query({ date, serviceIds: bookable.service.id });
    expect(response.status).toBe(200);
    const slots = (response.body.slots ?? []) as { startAt: string }[];
    return slots.map((slot) => slot.startAt).sort();
  }

  /** R24: one appointment's notification rows, as the administrator reads them. */
  async function listNotifications(appointmentId: string): Promise<JsonResponse> {
    return request(app)
      .get(`/api/v1/admin/appointments/${appointmentId}/notifications`)
      .set('Authorization', `Bearer ${admin.token}`);
  }

  function expectAppointment(response: JsonResponse): void {
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(
      isAppointment(response.body),
      JSON.stringify(isAppointment.errors ?? []),
    ).toBe(true);
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

  beforeAll(async () => {
    admin = await arrangeAdmin(app);
  });

  // ================================================== the transition (F1, F5)

  describe('the state transition (REQ-F-006, SCN-02)', () => {
    it('K1 cancels a confirmed appointment: 200, status cancelled, everything else kept', async () => {
      // SCN-02: "the appointment status becomes cancelled". The booking's own
      // fields are the control: cancellation changes the status and the audit
      // timestamp, and nothing a client was told (REQ-NF-005).
      const bookable = await arrangeBookable('Cancel Confirmed');
      const created = await book(bookable);
      expect(created.status).toBe(201);
      expect(created.body.status).toBe('confirmed');

      const cancelled = await cancel(created.body.accessToken as string);

      expectAppointment(cancelled);
      expect(cancelled.body.status).toBe('cancelled');
      expect(cancelled.body.id).toBe(created.body.id);
      expect(cancelled.body.client).toEqual(created.body.client);
      expect(cancelled.body.master).toEqual(created.body.master);
      expect(cancelled.body.services).toEqual(created.body.services);
      expect(cancelled.body.startAt).toBe(created.body.startAt);
      expect(cancelled.body.endAt).toBe(created.body.endAt);
      expect(cancelled.body.totalPrice).toEqual(created.body.totalPrice);
      expect(cancelled.body.accessToken).toBe(created.body.accessToken);
      expect(cancelled.body.confirmationUrl).toBe(created.body.confirmationUrl);
      // F5: the transition writes the injected clock (D9).
      expect(cancelled.body.updatedAt).toBe(NOW);
    });

    it('K2 answers 200 with the record unchanged when it is already cancelled', async () => {
      // F1, first cell: `cancelled` → 200 unchanged (error-model.md §3.1,
      // D15 "idempotent in effect"). The repeat runs under a LATER clock, so a
      // second write of `updated_at` would show up as 11:00 instead of 09:00 —
      // with one fixed clock, a rewrite would be invisible and this case would
      // prove nothing.
      const bookable = await arrangeBookable('Cancel Twice');
      const created = await book(bookable);
      expect(created.status).toBe(201);

      const first = await cancel(created.body.accessToken as string);
      expectAppointment(first);
      expect(first.body.status).toBe('cancelled');
      expect(first.body.updatedAt).toBe(NOW);

      const later = createApp({ now: () => new Date(LATER) });
      const second = await cancel(created.body.accessToken as string, later);

      expectAppointment(second);
      expect(second.body).toEqual(first.body);
      expect(second.body.updatedAt).toBe(NOW);
    });

    it('K3 answers 409 INVALID_STATE_TRANSITION for a completed appointment', async () => {
      // F1, second cell, and the only place P10's 409 is reachable. `completed`
      // is arranged out of band (F3): the operation that produces it is R23,
      // SMS-34 / S5.3. The state is read back afterwards, so the refusal is
      // shown to have written nothing.
      const bookable = await arrangeBookable('Cancel Completed');
      const created = await book(bookable);
      expect(created.status).toBe(201);

      await getPool().query(`update appointments set status = 'completed' where id = $1`, [
        created.body.id,
      ]);

      expectProblem(await cancel(created.body.accessToken as string), {
        status: 409,
        code: 'INVALID_STATE_TRANSITION',
      });

      const after = await getByToken(created.body.accessToken as string);
      expectAppointment(after);
      expect(after.body.status).toBe('completed');
    });
  });

  // ========================================================= the declared 404

  describe('the token names the record (P10\'s declared refusals)', () => {
    it('K4 answers 404 NOT_FOUND for a uuid that names no appointment', async () => {
      // The 200 comes from **this operation**, not from a neighbouring read: a
      // case that only asserted "404" would be green against the unmounted
      // route, where every request answers 404 (the fallback-green class,
      // runs-05 §4a). Cancelling a real record first makes the 200 the thing
      // that fails while P10 is missing.
      const bookable = await arrangeBookable('Cancel Unknown');
      const created = await book(bookable);
      expect(created.status).toBe(201);

      expectAppointment(await cancel(created.body.accessToken as string));

      expectProblem(await cancel(randomUUID()), { status: 404, code: 'NOT_FOUND' });
    });

    it('K5 answers 404 NOT_FOUND for a token that is not a uuid', async () => {
      // P10 declares no 400, so the shared parameter rule takes the 404 branch
      // (error-model.md §4, CL-09's mirror — the branch P9 takes too, and the
      // one R24 does not). A P10 200 is read first, for the reason K4 gives.
      const bookable = await arrangeBookable('Cancel Illtyped');
      const created = await book(bookable);
      expect(created.status).toBe(201);

      expectAppointment(await cancel(created.body.accessToken as string));

      expectProblem(await cancel('not-a-uuid'), { status: 404, code: 'NOT_FOUND' });
    });
  });

  // ============================================== what cancellation must not do

  describe('a cancellation writes no message (SRS v1.3 lines 253–256, 397–400)', () => {
    it('K6 records no notification row for any audience', async () => {
      // The client is not sent an SMS for a cancellation: "the client sees the
      // updated status on the confirmation page" (lines 253–256). The master's
      // and the administrator's alerts are SMS-30 (line 400). So the absence is
      // asserted for all three audiences, not only `client` — a `master` row
      // written here would be as wrong as a `client` one, because neither has a
      // preference or an actor to consult yet.
      const bookable = await arrangeBookable('Cancel Silent');
      const created = await book(bookable);
      expect(created.status).toBe(201);

      const cancelled = await cancel(created.body.accessToken as string);
      expectAppointment(cancelled);
      expect(cancelled.body.status).toBe('cancelled');

      const page = await listNotifications(created.body.id as string);
      expect(page.status).toBe(200);
      const rows = page.body.items as { audience: string; eventType: string }[];

      // The booking's own confirmation row is still there (REQ-NF-005).
      expect(
        rows.filter((row) => row.audience === 'client' && row.eventType === 'new'),
      ).toHaveLength(1);

      for (const audience of ['client', 'master', 'admin']) {
        expect(
          rows.filter((row) => row.audience === audience && row.eventType === 'cancellation'),
          `no cancellation row for audience "${audience}"`,
        ).toHaveLength(0);
      }
    });
  });

  // ================================================== the slot is freed (F4)

  describe('a cancelled block is free again (resource-model §4)', () => {
    it('K7 frees the slot: P7 offers it, and P8 books it a second time', async () => {
      // The partial unique index is the machine; this is the chain that shows
      // it end to end. The "before" read is what makes the "after" meaningful:
      // without it, "the slot is offered" could just be a slot that was never
      // taken.
      const bookable = await arrangeBookable('Cancel Freed');
      const created = await book(bookable);
      expect(created.status).toBe(201);

      const before = await getSlots(bookable, FAR_MONDAY);
      expect(before).not.toContain(onMonday('10:00'));

      const cancelled = await cancel(created.body.accessToken as string);
      expectAppointment(cancelled);
      expect(cancelled.body.status).toBe('cancelled');

      const after = await getSlots(bookable, FAR_MONDAY);
      expect(after).toContain(onMonday('10:00'));

      const rebooked = await book(bookable);
      expect(rebooked.status).toBe(201);
      expect(rebooked.body.id).not.toBe(created.body.id);
      expect(rebooked.body.status).toBe('confirmed');
    });
  });

  // ================================================ cancellation in the past

  describe('cancellation has no notice period (REQ-F-006)', () => {
    it('K8 cancels an appointment whose start is already in the past', async () => {
      // REQ-F-006's AC: "Cancelling at any time, including minutes before the
      // appointment, succeeds without a fee or error". P10 has no clock to
      // compare against and must not invent one. The record is booked in the
      // future and then moved into the past out of band: CL-11 refuses a past
      // start through P8, and K8 is about P10, not about P8's acceptance.
      const bookable = await arrangeBookable('Cancel Past');
      const created = await book(bookable, onMonday('10:00'));
      expect(created.status).toBe(201);

      await getPool().query(
        'update appointments set start_at = $2, end_at = $3 where id = $1',
        [created.body.id, onPastMonday('10:00'), onPastMonday('10:30')],
      );

      const cancelled = await cancel(created.body.accessToken as string);

      expectAppointment(cancelled);
      expect(cancelled.body.status).toBe('cancelled');
      expect(cancelled.body.totalPrice).toEqual(created.body.totalPrice);
      expect(new Date(cancelled.body.startAt as string).getTime()).toBeLessThan(
        new Date(NOW).getTime(),
      );
    });
  });
});
