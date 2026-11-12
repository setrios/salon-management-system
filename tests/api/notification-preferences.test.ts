/**
 * S4.1 notification preferences — the caller's channel × event settings, and
 * what they do to the rows an event writes.
 *
 *   M5  GET   /me/notification-preferences            getMyNotificationPreferences
 *   M6  PATCH /me/notification-preferences            updateMyNotificationPreference
 *   P8  POST  /appointments                           createAppointment
 *   R24 GET   /admin/appointments/{id}/notifications  listAppointmentNotifications
 *
 * Source: REQ-F-016 ("A master receives a notification (SMS and/or in-app, per
 *         their own preferences) when one of their own appointments is created,
 *         rescheduled, or cancelled"; AC: "Disabling all channels for an event
 *         type results in no notification of that type being sent to that
 *         master"), REQ-F-023 ("An event for any master's appointment produces a
 *         notification to the administrator unless disabled"), REQ-F-026
 *         ("Toggling one channel/event combination does not change any other
 *         channel/event combination's setting");
 *         SCN-06 (a master disables SMS for `new`, keeps in-app, and receives
 *         only the in-app one);
 *         `resource-model.md` §5.3 (M5: 200 `NotificationPreferenceList`, no
 *         errors; M6: 200 `NotificationPreference`, 400, 422);
 *         `openapi.yaml` NotificationPreference (`channel` ∈ {sms, in_app},
 *         `eventType` ∈ {new, reschedule, cancellation}, `enabled`),
 *         NotificationPreferencePatch (closed body, all three required).
 * Contract: openapi.yaml#/paths/~1me~1notification-preferences;
 *           schemas NotificationPreference, NotificationPreferenceList,
 *           NotificationPreferencePatch, NotificationPage, Problem.
 * Ticket: SMS-12 (Test)
 *
 * ---------------------------------------------------------------------------
 * Decisions this file is written against (S4.1 inventory, I1–I8):
 *
 *   I1  A preference is a stored row keyed by the principal, the channel and
 *       the event type. The principal is a `masters` row: the administrator is
 *       one, with `role = 'admin'` (REQ-F-017), so one table serves both.
 *   I2  The table is a **sparse override**: a row exists only for a combination
 *       the caller has toggled. M5 answers all six combinations, filling the
 *       missing ones with `enabled: true`, in the order sms/new,
 *       sms/reschedule, sms/cancellation, in_app/new, in_app/reschedule,
 *       in_app/cancellation. Enabled is the default because REQ-F-016's AC
 *       speaks of *disabling* a channel; a default of disabled would mean no
 *       notification is ever sent.
 *   I3  M5 and M6 are `JWT`, not `JWT-M`: the contract declares no 403 for
 *       either, unlike `/me/availability`, `/me/appointments` and
 *       `/me/services`. The administrator has preferences of their own
 *       (REQ-F-023), so one pair of operations serves both roles.
 *   I4  M6 changes exactly one combination and is an upsert: the same body
 *       twice leaves one row and the same answer. A body that violates
 *       `NotificationPreferencePatch` is 422 `VALIDATION_ERROR` (M6 declares
 *       422); a body that is not JSON is 400 `MALFORMED_REQUEST` (CL-09's rule:
 *       the operation's own response set decides).
 *   I5  An event writes one row per **enabled** channel, for the master and for
 *       the administrator. A disabled channel writes no row at all — that is
 *       REQ-F-016's AC, and it is why the rows are written per preference
 *       rather than written and then filtered on read.
 *   I6  The administrator's row is suppressed when the administrator caused the
 *       event (REQ-F-030). That rule is **not** in this stage: SCN-12's "When"
 *       is R21, the administrator's cancellation, which S5.1 delivers, and a
 *       rule with no operation to drive it cannot be asserted over HTTP. S4.1
 *       writes the administrator's rows for every event; the gate carries
 *       SMS-18 forward to S5.1, which adds the actor and the suppression with
 *       its own test.
 *   I7  The client's own rows are not governed by preferences: the confirmation
 *       SMS (E2) and the two reminders (H1) are written whatever the master's
 *       settings say. REQ-F-016 is about the master's notifications.
 *   I8  A row written for a master or the administrator is `sent` with
 *       `sentAt` = the event's clock: the channel is simulated (E3), and there
 *       is no queue for it to be `scheduled` in.
 *
 * What this file does *not* assert:
 *
 *   - **That an SMS left the system.** `sent` means "handed to the simulated
 *     channel" (E3), as for every other row.
 *   - **The administrator's suppression.** I6; it is S5.1's, with SMS-18.
 *   - **M7.** `tests/api/my-notifications.test.ts` owns the caller's list.
 */

import request from 'supertest';
import type { Express } from 'express';
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

/** Minimal view of a supertest response; see `tests/api/auth.test.ts`. */
interface JsonResponse {
  readonly status: number;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, any>;
}

/** One row of R24's page, as these cases read it. */
interface NotificationRow {
  readonly audience: string;
  readonly eventType: string;
  readonly channel: string;
  readonly status: string;
}

/** One preference, as M5 and M6 answer it. */
interface PreferenceRow {
  readonly channel: string;
  readonly eventType: string;
  readonly enabled: boolean;
}

/** The instant every case treats as "now" (D9). Kyiv is +02:00 in November. */
const NOW = '2026-11-12T09:00:00+02:00';

/** A Monday three weeks after NOW: the booking is in the future (CL-11). */
const FAR_MONDAY = '2026-12-07';
const WINTER_OFFSET = '+02:00';

/** The six combinations M5 answers, in the order I2 fixes. */
const ALL_COMBINATIONS: readonly PreferenceRow[] = [
  { channel: 'sms', eventType: 'new', enabled: true },
  { channel: 'sms', eventType: 'reschedule', enabled: true },
  { channel: 'sms', eventType: 'cancellation', enabled: true },
  { channel: 'in_app', eventType: 'new', enabled: true },
  { channel: 'in_app', eventType: 'reschedule', enabled: true },
  { channel: 'in_app', eventType: 'cancellation', enabled: true },
];

describe('S4.1 notification preferences — channel × event', () => {
  const app = createApp({ now: () => new Date(NOW) });

  const isPreferenceList = getSchemaValidator('NotificationPreferenceList');
  const isPreference = getSchemaValidator('NotificationPreference');
  const isNotificationPage = getSchemaValidator('NotificationPage');
  const isProblem = getSchemaValidator('Problem');

  let admin: AdminFixture;
  let haircut: ServiceFixture;

  beforeAll(async () => {
    admin = await arrangeAdmin(app);
    haircut = await arrangeService(app, admin.token, {
      name: unique('Preference Haircut'),
      baseDurationMinutes: 30,
    });
  });

  /** M5 through the given token. */
  async function preferences(token: string): Promise<JsonResponse> {
    return request(app)
      .get('/api/v1/me/notification-preferences')
      .set('Authorization', `Bearer ${token}`);
  }

  /** M6 through the given token. */
  async function toggle(token: string, body: unknown): Promise<JsonResponse> {
    return request(app)
      .patch('/api/v1/me/notification-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);
  }

  /** R24, the only operation that shows every audience's rows of a record. */
  async function rows(appointmentId: string): Promise<NotificationRow[]> {
    const response = await request(app)
      .get(`/api/v1/admin/appointments/${appointmentId}/notifications`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(response.status).toBe(200);
    return response.body.items as NotificationRow[];
  }

  /** A master of this case's own, bookable on the test's Monday. */
  async function arrangeBookable(): Promise<MasterFixture> {
    const master = await arrangeMaster(app, unique('Preference Master'));
    await arrangeLink(app, admin.token, master.id, haircut.id, 40000);
    await request(app)
      .put('/api/v1/me/availability')
      .set('Authorization', `Bearer ${master.token}`)
      .send({ weekly: [{ dayOfWeek: 1, startTime: '10:00', endTime: '18:00' }], dates: [] });
    return master;
  }

  /** Books the shared haircut through P8. */
  async function book(masterId: string): Promise<JsonResponse> {
    return request(app)
      .post('/api/v1/appointments')
      .send({
        client: { name: 'Iryna Kovalenko', phone: '+380501234567' },
        masterId,
        serviceIds: [haircut.id],
        startAt: `${FAR_MONDAY}T10:00:00${WINTER_OFFSET}`,
      });
  }

  /** The four fields these cases compare; a row carries more (id, dates). */
  function pick(row: NotificationRow): NotificationRow {
    return {
      audience: row.audience,
      eventType: row.eventType,
      channel: row.channel,
      status: row.status,
    };
  }

  function expectProblem(response: JsonResponse, expected: { status: number; code: string }): void {
    expect(response.status).toBe(expected.status);
    expect(response.headers['content-type']).toBe('application/problem+json');
    expect(isProblem(response.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);
    expect(response.body).toMatchObject({ status: expected.status, code: expected.code });
  }

  // ======================================== M5 and M6 (REQ-F-016, REQ-F-026)

  describe('the caller\'s own settings (M5, M6)', () => {
    it('P1 answers the six combinations, all enabled, for a fresh master', async () => {
      const master = await arrangeMaster(app, unique('Preference Fresh'));

      const response = await preferences(master.token);

      expect(response.status).toBe(200);
      expect(
        isPreferenceList(response.body),
        JSON.stringify(isPreferenceList.errors ?? []),
      ).toBe(true);
      expect(response.body).toEqual(ALL_COMBINATIONS);
    });

    it('P2 toggles one combination and leaves the other five alone (REQ-F-026)', async () => {
      const master = await arrangeMaster(app, unique('Preference Toggle'));

      const patched = await toggle(master.token, {
        channel: 'sms',
        eventType: 'cancellation',
        enabled: false,
      });

      expect(patched.status).toBe(200);
      expect(isPreference(patched.body), JSON.stringify(isPreference.errors ?? [])).toBe(true);
      expect(patched.body).toEqual({
        channel: 'sms',
        eventType: 'cancellation',
        enabled: false,
      });

      const after = await preferences(master.token);
      expect(after.body).toEqual(
        ALL_COMBINATIONS.map((row) =>
          row.channel === 'sms' && row.eventType === 'cancellation'
            ? { ...row, enabled: false }
            : row,
        ),
      );
    });

    it('P3 is an upsert: the same body twice leaves one row and the same answer', async () => {
      const master = await arrangeMaster(app, unique('Preference Twice'));
      const body = { channel: 'in_app', eventType: 'reschedule', enabled: false };

      const first = await toggle(master.token, body);
      const second = await toggle(master.token, body);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);

      const after = await preferences(master.token);
      expect(after.body).toEqual(
        ALL_COMBINATIONS.map((row) =>
          row.channel === 'in_app' && row.eventType === 'reschedule'
            ? { ...row, enabled: false }
            : row,
        ),
      );
    });

    it('P4 rejects an unknown channel with 422 VALIDATION_ERROR', async () => {
      const master = await arrangeMaster(app, unique('Preference Unknown'));

      const response = await toggle(master.token, {
        channel: 'email',
        eventType: 'new',
        enabled: false,
      });

      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
    });

    it('P5 rejects an extra field: the patch body is closed', async () => {
      const master = await arrangeMaster(app, unique('Preference Extra'));

      const response = await toggle(master.token, {
        channel: 'sms',
        eventType: 'new',
        enabled: false,
        masterId: master.id,
      });

      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
    });

    it('P6 rejects a body that is not JSON with 400 MALFORMED_REQUEST', async () => {
      const master = await arrangeMaster(app, unique('Preference Malformed'));

      // The route must exist for the 400 to be M6's: a valid body on the same
      // route is 200, so the parser's rejection is not a 404 in disguise.
      const valid = await toggle(master.token, {
        channel: 'sms',
        eventType: 'new',
        enabled: true,
      });
      expect(valid.status).toBe(200);

      const response = await request(app)
        .patch('/api/v1/me/notification-preferences')
        .set('Authorization', `Bearer ${master.token}`)
        .set('Content-Type', 'application/json')
        .send('{not json');

      expectProblem(response, { status: 400, code: 'MALFORMED_REQUEST' });
    });

    it('P7 rejects a non-JSON content type with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const master = await arrangeMaster(app, unique('Preference Media'));

      const response = await request(app)
        .patch('/api/v1/me/notification-preferences')
        .set('Authorization', `Bearer ${master.token}`)
        .set('Content-Type', 'text/plain')
        .send('channel=sms');

      expectProblem(response, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    });

    it('P8 answers 401 without a token, on both operations', async () => {
      const read = await request(app).get('/api/v1/me/notification-preferences');
      const write = await request(app)
        .patch('/api/v1/me/notification-preferences')
        .send({ channel: 'sms', eventType: 'new', enabled: false });

      expectProblem(read, { status: 401, code: 'UNAUTHENTICATED' });
      expectProblem(write, { status: 401, code: 'UNAUTHENTICATED' });
    });

    it('P9 gives the administrator preferences of their own (REQ-F-023)', async () => {
      const master = await arrangeMaster(app, unique('Preference Separate'));

      await toggle(master.token, { channel: 'sms', eventType: 'new', enabled: false });

      const adminView = await preferences(admin.token);
      expect(adminView.status).toBe(200);
      expect(adminView.body).toEqual(ALL_COMBINATIONS);

      const masterView = await preferences(master.token);
      expect(masterView.body).toEqual(
        ALL_COMBINATIONS.map((row) =>
          row.channel === 'sms' && row.eventType === 'new' ? { ...row, enabled: false } : row,
        ),
      );
    });
  });

  // ======================================== what a preference does (SCN-06)

  describe('what a preference does to the rows an event writes (SCN-06)', () => {
    it('P10 sends only the in-app row when SMS is off for new (SCN-06)', async () => {
      const master = await arrangeBookable();
      await toggle(master.token, { channel: 'sms', eventType: 'new', enabled: false });
      await toggle(master.token, { channel: 'in_app', eventType: 'new', enabled: true });

      const created = await book(master.id);
      expect(created.status).toBe(201);

      const all = await rows(created.body.id as string);
      const masterRows = all.filter(
        (row) => row.audience === 'master' && row.eventType === 'new',
      );

      expect(masterRows.map(pick)).toEqual([
        { audience: 'master', eventType: 'new', channel: 'in_app', status: 'sent' },
      ]);
    });

    it('P11 writes no master row at all when both channels are off (REQ-F-016)', async () => {
      const master = await arrangeBookable();
      await toggle(master.token, { channel: 'sms', eventType: 'new', enabled: false });
      await toggle(master.token, { channel: 'in_app', eventType: 'new', enabled: false });

      const created = await book(master.id);
      expect(created.status).toBe(201);

      const all = await rows(created.body.id as string);
      expect(all.filter((row) => row.audience === 'master')).toEqual([]);
      // The event did write rows — the administrator's are there (REQ-F-023) —
      // so the empty master list is a suppression, not a booking that wrote
      // nothing.
      expect(
        all.filter((row) => row.audience === 'admin' && row.eventType === 'new').length,
      ).toBe(2);
    });

    it('P12 leaves the client\'s confirmation SMS alone (I7)', async () => {
      const master = await arrangeBookable();
      await toggle(master.token, { channel: 'sms', eventType: 'new', enabled: false });

      const created = await book(master.id);
      expect(created.status).toBe(201);

      const all = await rows(created.body.id as string);
      const newRows = all.filter((row) => row.eventType === 'new');

      // The same event, two audiences, one preference: the master's SMS is off
      // and the client's is not.
      expect(
        newRows.filter((row) => row.audience === 'master').map((row) => row.channel),
      ).toEqual(['in_app']);
      expect(newRows.filter((row) => row.audience === 'client').map(pick)).toEqual([
        { audience: 'client', eventType: 'new', channel: 'sms', status: 'sent' },
      ]);
    });

    it('P13 still notifies the administrator when the master is silent (REQ-F-023)', async () => {
      const master = await arrangeBookable();
      await toggle(master.token, { channel: 'sms', eventType: 'new', enabled: false });
      await toggle(master.token, { channel: 'in_app', eventType: 'new', enabled: false });

      const created = await book(master.id);
      expect(created.status).toBe(201);

      const all = await rows(created.body.id as string);
      const adminRows = all.filter(
        (row) => row.audience === 'admin' && row.eventType === 'new',
      );

      expect(adminRows.map((row) => row.channel).sort()).toEqual(['in_app', 'sms']);
      expect(adminRows.every((row) => row.status === 'sent')).toBe(true);
    });
  });
});
