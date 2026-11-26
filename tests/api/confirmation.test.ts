/**
 * S2.2 confirmation page — P9 `getAppointmentByToken`.
 *
 *   P9 GET /appointments/{token}   getAppointmentByToken   (public, `security: []`)
 *
 * Source: REQ-F-004 (the page is reachable again later via the link; the page
 *         and its access token remain valid, read-only, after cancellation —
 *         SRS v1.3 glossary "Confirmation Page", lines 378–384, confirmed at the
 *         v1.1 SPEC-GATE), REQ-NF-001 (the token is the credential), REQ-NF-005
 *         (history is not rewritten by later deactivation);
 *         SCN-01 ("a confirmation page is shown with cancel and reschedule
 *         links"); `resource-model.md` §5.1 (P9: 200 `Appointment`, 404);
 *         `error-model.md` §3 (404 for an unknown id).
 * Contract: openapi.yaml#/paths/~1appointments~1{token}; schemas Appointment,
 *           AppointmentService, Reminder, Problem.
 *
 * What this file does *not* assert, because the contract cannot express it:
 *
 *   - **HTML.** REQ-NF-002/003/004 are UI properties and belong to SMS-36. In
 *     this contract "the confirmation page" is the resource P9 returns.
 *   - **Cancel and reschedule URLs.** `Appointment` carries `confirmationUrl`
 *     and has no `cancelUrl`/`rescheduleUrl`; those two controls are the
 *     token-addressed operations P10 (S2.3) and P11 (S3.1), which the client
 *     derives from `accessToken`.
 *   - **That `confirmationUrl` resolves.** The origin is the contract's own
 *     example (`https://salon.example`), and nothing serves it; runs-05 §8
 *     records that. C6 asserts only that P9 returns the same URL P8 did.
 *
 * C8's arrangement **is P10** (cancellation, S2.3). When this file was first
 * written the operation did not exist, and C8 put the record into `cancelled`
 * out of band; S2.3 replaced that `update` with the contract's own call
 * (`POST /appointments/{token}/cancel`), so there is one way to cancel a record
 * and it is the operation the contract defines. C8's subject remains P9's
 * answer for such a record — that the resource is readable, read-only, after
 * cancellation (SRS v1.3 glossary "Confirmation Page", lines 378–384).
 */

import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { getSchemaValidator } from '../../src/contract/validators.js';
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

/** The instant the booking app treats as "now" (D9); Kyiv is +02:00 in November. */
const NOW = '2026-11-12T09:00:00+02:00';

/** Two hours later: the same record, read by a clock that has moved. */
const LATER = '2026-11-12T11:00:00+02:00';

/** A Monday three weeks after NOW. */
const FAR_MONDAY = '2026-12-07';
const WINTER_OFFSET = '+02:00';

/** A wall-clock instant on the test's Monday. */
function onMonday(time: string): string {
  return `${FAR_MONDAY}T${time}:00${WINTER_OFFSET}`;
}

describe('S2.2 confirmation page — P9 getAppointmentByToken', () => {
  const app = createApp({ now: () => new Date(NOW) });

  const isProblem = getSchemaValidator('Problem');
  const isAppointment = getSchemaValidator('Appointment');

  let admin: AdminFixture;

  /** A master with one 30-minute service, working Mondays and Thursdays. */
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
    // One PUT with both windows: M4 replaces the whole rule set (resource-model
    // §4), so two sequential calls would leave only the second. Monday 10:00–18:00
    // is where C1–C6 and C9 book; Thursday 08:00–18:00 is where C7 books, since
    // NOW is a Thursday morning.
    const windows = await request(app)
      .put('/api/v1/me/availability')
      .set('Authorization', `Bearer ${master.token}`)
      .send({
        weekly: [
          { dayOfWeek: 1, startTime: '10:00', endTime: '18:00' },
          { dayOfWeek: 4, startTime: '08:00', endTime: '18:00' },
        ],
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

  /** P9, with no `Authorization` header — the token is the credential. */
  async function getByToken(token: string, application = app): Promise<JsonResponse> {
    return request(application).get(`/api/v1/appointments/${token}`);
  }

  function expectAppointment(response: JsonResponse): void {
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(isAppointment(response.body), JSON.stringify(isAppointment.errors ?? [])).toBe(true);
  }

  function expectProblem(response: JsonResponse, expected: { status: number; code: string }): void {
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

  // =============================================== the record, by its token

  describe('the appointment behind the token (REQ-F-004, REQ-NF-001)', () => {
    it('C1 returns the appointment P8 created, with the same fields', async () => {
      // SCN-01: the page is shown right after booking and again later. "Again"
      // is the claim: the resource is the same one, not a second view with its
      // own rules.
      const bookable = await arrangeBookable('Confirmation Same');
      const created = await book(bookable);
      expect(created.status).toBe(201);

      const read = await getByToken(created.body.accessToken as string);

      expectAppointment(read);
      expect(read.body).toMatchObject({
        id: created.body.id,
        status: created.body.status,
        client: created.body.client,
        master: created.body.master,
        services: created.body.services,
        startAt: created.body.startAt,
        endAt: created.body.endAt,
        totalDurationMinutes: created.body.totalDurationMinutes,
        occupiedDurationMinutes: created.body.occupiedDurationMinutes,
        totalPrice: created.body.totalPrice,
        accessToken: created.body.accessToken,
        confirmationUrl: created.body.confirmationUrl,
        createdAt: created.body.createdAt,
      });
    });

    it('C2 answers without any token: the access token is the credential', async () => {
      // `security: []` on P9. A supertest assertion says the middleware chain
      // demands no bearer token; what a client sends is the uuid in the path.
      const bookable = await arrangeBookable('Confirmation Public');
      const created = await book(bookable);

      const read = await getByToken(created.body.accessToken as string);

      expectAppointment(read);
      expect(read.body.id).toBe(created.body.id);
    });

    it('C3 answers 404 NOT_FOUND for a uuid that names no appointment', async () => {
      // P9's declared 404, asserted *after* a 200 in the same case: an
      // unmounted path answers 404 too, so a bare 404 proves nothing
      // (the S2.1 fallback-green class, runs-05 §4a).
      const bookable = await arrangeBookable('Confirmation Unknown');
      const created = await book(bookable);
      expectAppointment(await getByToken(created.body.accessToken as string));

      expectProblem(await getByToken(randomUUID()), {
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    it('C4 answers 404 NOT_FOUND for a token that is not a uuid', async () => {
      // P9 declares no 400, and a value that is not a uuid names no record, so
      // the answer is 404 — inside the declared set (decision E6). Again the
      // 200 comes first, so this cannot pass because the route is missing.
      const bookable = await arrangeBookable('Confirmation Malformed');
      const created = await book(bookable);
      expectAppointment(await getByToken(created.body.accessToken as string));

      expectProblem(await getByToken('not-a-uuid'), {
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    it('C5 returns each token its own appointment, never another', async () => {
      // REQ-NF-001: guessing a token does not grant access to another client's
      // appointment. The observable form of that is that the token selects.
      const first = await arrangeBookable('Confirmation First');
      const second = await arrangeBookable('Confirmation Second');
      const firstBooking = await book(first);
      const secondBooking = await book(second);
      expect(firstBooking.status).toBe(201);
      expect(secondBooking.status).toBe(201);

      const firstRead = await getByToken(firstBooking.body.accessToken as string);
      const secondRead = await getByToken(secondBooking.body.accessToken as string);

      expectAppointment(firstRead);
      expectAppointment(secondRead);
      expect(firstRead.body.id).toBe(firstBooking.body.id);
      expect(secondRead.body.id).toBe(secondBooking.body.id);
      expect(firstRead.body.id).not.toBe(secondRead.body.id);
    });

    it('C6 returns the same confirmationUrl the booking response carried', async () => {
      // REQ-F-004's link. The origin is the contract's example and nothing
      // serves it (runs-05 §8); what this pins is that the URL a client was
      // given at booking is the URL a later read hands back, still carrying
      // the token.
      const bookable = await arrangeBookable('Confirmation Url');
      const created = await book(bookable);

      const read = await getByToken(created.body.accessToken as string);

      expectAppointment(read);
      expect(read.body.confirmationUrl).toBe(created.body.confirmationUrl);
      expect(read.body.confirmationUrl).toContain(created.body.accessToken as string);
    });
  });

  // =========================================== what a later read must show

  describe('the record as it is now, not as it was booked (REQ-NF-005)', () => {
    it('C7 dispatches a due reminder on read: the same record under a later clock', async () => {
      // H3 (S3.2): the reminders are stored rows, and a read is what dispatches
      // a due one. A booking at Thursday 12:00 read at 09:00 has the 2 h moment
      // (10:00) still ahead; read at 11:00 it has passed and is `sent`. The
      // 24 h moment (Wednesday 12:00) was already past at booking, so that row
      // is `skipped` and stays `skipped` (H4). Both reads are 200 — the record
      // did not change, the clock did.
      const bookable = await arrangeBookable('Confirmation Reminders');
      const created = await book(bookable, '2026-11-12T12:00:00+02:00');
      expect(created.status).toBe(201);

      const atBooking = await getByToken(created.body.accessToken as string);
      expectAppointment(atBooking);
      const before = atBooking.body.reminders as Array<{ type: string; status: string }>;
      expect(before.find((reminder) => reminder.type === '2h')?.status).toBe('scheduled');
      expect(before.find((reminder) => reminder.type === '24h')?.status).toBe('skipped');

      const later = createApp({ now: () => new Date(LATER) });
      const atLater = await getByToken(created.body.accessToken as string, later);
      expectAppointment(atLater);
      const after = atLater.body.reminders as Array<{ type: string; status: string }>;

      expect(after.find((reminder) => reminder.type === '2h')?.status).toBe('sent');
      expect(after.find((reminder) => reminder.type === '24h')?.status).toBe('skipped');
      expect(atLater.body.id).toBe(atBooking.body.id);
    });

    it('C8 answers 200 for a cancelled appointment, with the same token and URL', async () => {
      // SRS v1.3 glossary: the page and its access token remain valid after
      // cancellation; the page shows the status. Not 404, not 409, not an empty
      // body. The state is produced by P10 (S2.3) — the operation the contract
      // defines for it — and not by a direct write, so this case exercises the
      // cancellation the API actually offers.
      const bookable = await arrangeBookable('Confirmation Cancelled');
      const created = await book(bookable);
      expect(created.status).toBe(201);

      const cancelled = await request(app).post(
        `/api/v1/appointments/${created.body.accessToken as string}/cancel`,
      );
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.status).toBe('cancelled');

      const read = await getByToken(created.body.accessToken as string);

      expectAppointment(read);
      expect(read.body.status).toBe('cancelled');
      expect(read.body.accessToken).toBe(created.body.accessToken);
      expect(read.body.confirmationUrl).toBe(created.body.confirmationUrl);
    });

    it('C9 keeps the service snapshot after the service is deactivated through R8', async () => {
      // REQ-NF-005: deactivation removes a service from future selection and
      // does not rewrite history. The line names the service as booked; the
      // read does not join the live catalogue for its shape.
      const bookable = await arrangeBookable('Confirmation Retired');
      const created = await book(bookable);
      expect(created.status).toBe(201);
      const bookedLines = created.body.services as Array<Record<string, any>>;

      const deactivated = await request(app)
        .patch(`/api/v1/admin/services/${bookable.service.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ active: false });
      expect(deactivated.status).toBe(200);

      const read = await getByToken(created.body.accessToken as string);

      expectAppointment(read);
      expect(read.body.services).toEqual(bookedLines);
    });
  });
});
