/**
 * SMS-70 — the confirmation link points to this deployment's confirmation page.
 *
 * REQ-F-005 asks for "a valid link to REQ-F-004's page", and the contract
 * describes `Appointment.confirmationUrl` as the "Reachable confirmation page
 * (REQ-F-004)". Until now the origin was the contract example's placeholder
 * (`https://salon.example`), which nothing serves (see the header of
 * `confirmation.test.ts`, "That `confirmationUrl` resolves").
 *
 * UI-GATE decision U-1 (`logs/gates/2026-11-26-ui-gate.md`): the origin comes
 * from configuration, `PUBLIC_BASE_URL`, defaulting to `http://localhost:<PORT>`;
 * the path stays `/appointments/{token}`, the path of screen C2 in
 * `spec/ui/screens.md` §3. The contract is unchanged: its schema says
 * `format: uri`, and the example host remains an example.
 *
 * What this file does not assert: that the page answers at that URL. Serving
 * the page is SMS-36, and the browser tests of SMS-57 open it.
 *
 *   U1  the origin is read from PUBLIC_BASE_URL
 *   U2  without it, the origin is http://localhost:<PORT>
 *   U3  a trailing slash is not doubled into the path
 *   U4  a value that is not an absolute http(s) URL is a configuration error
 *   U5  P8 answers confirmationUrl = <origin>/appointments/<accessToken>
 *   U6  P9 answers the same URL for the same token
 *
 * Source: REQ-F-004, REQ-F-005; UI-GATE U-1; spec/ui/screens.md §3 (C2).
 * Contract: openapi.yaml#/components/schemas/Appointment (confirmationUrl).
 * Ticket: SMS-70 (Test)
 */

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { config, loadConfig } from '../../src/config.js';
import {
  arrangeAdmin,
  arrangeLink,
  arrangeMaster,
  arrangeService,
  arrangeWeeklyWindow,
  unique,
} from '../helpers/booking.js';

/** The booking clock (D9): a Thursday in November, Kyiv at +02:00. */
const NOW = '2026-11-12T09:00:00+02:00';

/** A Monday well after NOW, inside the master's window below. */
const START_AT = '2026-12-07T10:00:00+02:00';

describe('SMS-70 confirmation link origin — configuration', () => {
  it('U1 reads the origin from PUBLIC_BASE_URL', () => {
    const loaded = loadConfig({ NODE_ENV: 'test', PUBLIC_BASE_URL: 'https://book.salon.test' });
    expect(loaded.publicBaseUrl).toBe('https://book.salon.test');
  });

  it('U2 defaults to http://localhost:<PORT>', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).publicBaseUrl).toBe('http://localhost:3000');
    expect(loadConfig({ NODE_ENV: 'test', PORT: '4100' }).publicBaseUrl).toBe(
      'http://localhost:4100',
    );
  });

  it('U3 drops a trailing slash so the path is not doubled', () => {
    const loaded = loadConfig({ NODE_ENV: 'test', PUBLIC_BASE_URL: 'https://book.salon.test/' });
    expect(loaded.publicBaseUrl).toBe('https://book.salon.test');
  });

  it('U4 refuses a value that is not an absolute http(s) URL', () => {
    for (const value of ['salon', '/appointments', 'ftp://book.salon.test']) {
      expect(() => loadConfig({ NODE_ENV: 'test', PUBLIC_BASE_URL: value })).toThrow(
        /PUBLIC_BASE_URL/,
      );
    }
  });
});

describe('SMS-70 confirmation link origin — P8 and P9', () => {
  const app = createApp({ now: () => new Date(NOW) });

  let masterId: string;
  let serviceId: string;

  beforeAll(async () => {
    const admin = await arrangeAdmin(app);
    const master = await arrangeMaster(app, unique('link master'));
    const service = await arrangeService(app, admin.token, {
      name: unique('link service'),
      baseDurationMinutes: 30,
    });
    await arrangeLink(app, admin.token, master.id, service.id, 45000);
    await arrangeWeeklyWindow(app, master.token, 1, '10:00', '18:00');
    masterId = master.id;
    serviceId = service.id;
  });

  it('U5 P8 answers <origin>/appointments/<accessToken>', async () => {
    const created = await request(app)
      .post('/api/v1/appointments')
      .send({
        client: { name: 'Olena Shevchenko', phone: '+380501112233' },
        masterId,
        serviceIds: [serviceId],
        startAt: START_AT,
      });

    expect(created.status).toBe(201);
    expect(created.body.confirmationUrl).toBe(
      `${config.publicBaseUrl}/appointments/${created.body.accessToken}`,
    );
  });

  it('U6 P9 answers the same URL for the same token', async () => {
    const created = await request(app)
      .post('/api/v1/appointments')
      .send({
        client: { name: 'Taras Melnyk', phone: '+380502223344' },
        masterId,
        serviceIds: [serviceId],
        startAt: '2026-12-07T11:00:00+02:00',
      });
    expect(created.status).toBe(201);

    const read = await request(app).get(`/api/v1/appointments/${created.body.accessToken}`);
    expect(read.status).toBe(200);
    expect(read.body.confirmationUrl).toBe(
      `${config.publicBaseUrl}/appointments/${created.body.accessToken}`,
    );
  });
});
