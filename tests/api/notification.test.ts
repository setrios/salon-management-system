/**
 * S2.2 confirmation SMS — R24 `listAppointmentNotifications`.
 *
 *   R24 GET /admin/appointments/{appointmentId}/notifications
 *       listAppointmentNotifications   (administrator, bearer token)
 *
 * Source: REQ-F-005 ("Exactly one confirmation SMS per successful booking is
 *         recorded, containing a valid link to REQ-F-004's page"), REQ-F-003
 *         (a booking is created confirmed, with no approval step), REQ-NF-001
 *         (the token, not the phone, is the client's credential);
 *         SCN-01 ("exactly one confirmation SMS is recorded for the client");
 *         `resource-model.md:37` (REQ-F-005 → P8, R24 — the notification record
 *         with `eventType=new` is the observable form), `:264` (R24's response
 *         set), `api-traceability.md:31` (the same mapping);
 *         `error-model.md` §3–§4.
 * Contract: openapi.yaml#/paths/~1admin~1appointments~1{appointmentId}~1notifications;
 *           schemas NotificationPage, Notification, Problem.
 *
 * Why "exactly one" is provable here, and what "one" means:
 *
 *   - **The record is written in the booking transaction.** One successful P8
 *     writes one `notifications` row and, if anything in that transaction
 *     fails, none. A refused booking (N3) writes nothing.
 *   - **"Exactly one" is asserted per appointment, not globally.** When the
 *     notification service (SMS-30) adds the master's and the administrator's
 *     records, REQ-F-005 is still satisfied; a `total === 1` assertion would
 *     forbid that, so N1 counts the client/new/sms rows instead.
 *   - **`status: sent` means "handed to the simulated channel".** SMS delivery
 *     is simulated in this version (SRS §3, Assumptions and Dependencies), so
 *     no message leaves the process; what the record states is that the system
 *     decided to send it, not that a phone rang.
 *
 * What this file does not assert, because the contract cannot express it: the
 * **text** of the message. `Notification` has no text field; the link lives in
 * `Appointment.confirmationUrl`, which P8's B7 and P9's C6 assert. A message
 * body is an addendum candidate (inventory E10), not a change made here.
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
  arrangeWeeklyWindow,
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

/** The instant the application treats as "now" (D9). */
const NOW = '2026-11-12T09:00:00+02:00';

/** A Monday three weeks after NOW. */
const FAR_MONDAY = '2026-12-07';
const WINTER_OFFSET = '+02:00';

function onMonday(time: string): string {
  return `${FAR_MONDAY}T${time}:00${WINTER_OFFSET}`;
}

/** The client confirmation message of one booking, as REQ-F-005 names it. */
interface NotificationRow {
  readonly id: string;
  readonly appointmentId?: string;
  readonly audience: string;
  readonly eventType: string;
  readonly channel: string;
  readonly status: string;
  readonly scheduledAt?: string;
  readonly sentAt?: string;
  readonly createdAt: string;
}

describe('S2.2 confirmation SMS — R24 listAppointmentNotifications', () => {
  const app = createApp({ now: () => new Date(NOW) });

  const isProblem = getSchemaValidator('Problem');
  const isNotificationPage = getSchemaValidator('NotificationPage');

  let admin: AdminFixture;

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
    await arrangeWeeklyWindow(app, master.token, 1, '10:00', '18:00');
    return { master, service };
  }

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

  /** R24 as the administrator reads it. */
  async function listNotifications(
    appointmentId: string,
    options: { readonly token?: string } = { token: admin.token },
  ): Promise<JsonResponse> {
    const call = request(app).get(`/api/v1/admin/appointments/${appointmentId}/notifications`);
    return options.token === undefined
      ? call
      : call.set('Authorization', `Bearer ${options.token}`);
  }

  /** The client's booking-confirmation rows: REQ-F-005's subject. */
  function clientNewSms(page: JsonResponse): NotificationRow[] {
    const rows = page.body.items as NotificationRow[];
    return rows.filter(
      (row) => row.audience === 'client' && row.eventType === 'new' && row.channel === 'sms',
    );
  }

  function expectPage(response: JsonResponse): void {
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(isNotificationPage(response.body), JSON.stringify(isNotificationPage.errors ?? [])).toBe(
      true,
    );
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

  // ======================================== exactly one, as REQ-F-005 means it

  describe('exactly one confirmation message per booking (REQ-F-005, SCN-01)', () => {
    it('N1 records exactly one client SMS with eventType new and status sent', async () => {
      // SCN-01's last step: "exactly one confirmation SMS is recorded for the
      // client". Counted by predicate, not by `total` — see the file header.
      const { master, service } = await arrangeBookable('Sms One');
      const created = await book({ master, service });
      expect(created.status).toBe(201);

      const page = await listNotifications(created.body.id as string);

      expectPage(page);
      const rows = clientNewSms(page);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        appointmentId: created.body.id,
        audience: 'client',
        eventType: 'new',
        channel: 'sms',
        status: 'sent',
      });
      expect(rows[0]?.sentAt).toBeDefined();
      expect(rows[0]?.createdAt).toBeDefined();
    });

    it('N2 gives a second booking its own single message, leaving the first at one', async () => {
      // "One per booking", not "one in the system": the second booking must be
      // told to the client too, and the first must not gain a second record.
      const first = await arrangeBookable('Sms First');
      const second = await arrangeBookable('Sms Second');
      const firstBooking = await book(first);
      const secondBooking = await book(second);
      expect(firstBooking.status).toBe(201);
      expect(secondBooking.status).toBe(201);

      const firstPage = await listNotifications(firstBooking.body.id as string);
      const secondPage = await listNotifications(secondBooking.body.id as string);

      expectPage(firstPage);
      expectPage(secondPage);
      expect(clientNewSms(firstPage)).toHaveLength(1);
      expect(clientNewSms(secondPage)).toHaveLength(1);
      expect(clientNewSms(firstPage)[0]?.id).not.toBe(clientNewSms(secondPage)[0]?.id);
    });

    it('N3 records nothing when the booking is refused: the repeat is a 409', async () => {
      // A repeat of the same body is the same start for the same master, so D2
      // refuses it before any insert. A refusal that still wrote a message
      // would be "at least one" in the wrong direction: the client would be
      // told twice about a booking that exists once.
      const { master, service } = await arrangeBookable('Sms Repeat');
      const created = await book({ master, service });
      expect(created.status).toBe(201);

      const repeat = await book({ master, service });
      expect(repeat.status).toBe(409);

      const page = await listNotifications(created.body.id as string);

      expectPage(page);
      expect(clientNewSms(page)).toHaveLength(1);
    });
  });

  // ===================================================== the declared refusals

  describe("the operation is the administrator's (R24's declared set)", () => {
    it('N4 answers 401 UNAUTHENTICATED without a bearer token', async () => {
      const { master, service } = await arrangeBookable('Sms Noauth');
      const created = await book({ master, service });
      expect(created.status).toBe(201);

      expectProblem(await listNotifications(created.body.id as string, { token: undefined }), {
        status: 401,
        code: 'UNAUTHENTICATED',
      });
    });

    it("N5 answers 403 FORBIDDEN for a master's token", async () => {
      // The operation is `tags: [Admin]` behind the administrator gate; a
      // master is authenticated but not permitted (error-model.md §4).
      const { master, service } = await arrangeBookable('Sms Forbidden');
      const created = await book({ master, service });
      expect(created.status).toBe(201);

      expectProblem(await listNotifications(created.body.id as string, { token: master.token }), {
        status: 403,
        code: 'FORBIDDEN',
      });
    });

    it('N6 answers 404 NOT_FOUND for an appointment id that names no record', async () => {
      // The 200 comes first, so the 404 cannot pass because the route is
      // missing (the S2.1 fallback-green class, runs-05 §4a).
      const { master, service } = await arrangeBookable('Sms Unknown');
      const created = await book({ master, service });
      expect(created.status).toBe(201);
      expectPage(await listNotifications(created.body.id as string));

      expectProblem(await listNotifications(randomUUID()), {
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    it('N7 answers 400 MALFORMED_REQUEST for an appointment id that is not a uuid', async () => {
      // R24 declares 400, so the shared parameter rule answers an ill-typed
      // parameter with 400 MALFORMED_REQUEST (error-model.md §4, CL-09's
      // mirror: the status follows the operation's declared set, not its id).
      // This is the branch P9 does *not* take, because P9 declares no 400.
      const { master, service } = await arrangeBookable('Sms Illtyped');
      const created = await book({ master, service });
      expect(created.status).toBe(201);
      expectPage(await listNotifications(created.body.id as string));

      expectProblem(await listNotifications('not-a-uuid'), {
        status: 400,
        code: 'MALFORMED_REQUEST',
      });
    });

    it('N8 returns the NotificationPage envelope with the default page and pageSize', async () => {
      // `NotificationPage` requires `items`, `page`, `pageSize`, `total`; the
      // contract's pagination defaults are page 1 and pageSize 20.
      const { master, service } = await arrangeBookable('Sms Envelope');
      const created = await book({ master, service });
      expect(created.status).toBe(201);

      const page = await listNotifications(created.body.id as string);

      expectPage(page);
      expect(page.body.page).toBe(1);
      expect(page.body.pageSize).toBe(20);
      expect(page.body.total).toBe((page.body.items as NotificationRow[]).length);
    });
  });
});
