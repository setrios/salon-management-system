/**
 * NFR acceptance — S5.5, the non-functional requirements that are observable
 * through the API (SMS-20).
 *
 * **What this file verifies, and what it deliberately does not.**
 *
 * The plan (§2) assigns the NFRs like this, and this file follows it:
 *
 *   - **Here:** REQ-NF-006 (client data visible only to authorised parties),
 *     REQ-NF-007 (one location, one time zone, no selector anywhere),
 *     REQ-NF-005 and REQ-NF-009 (absence constraints: no purge job, no payment
 *     gateway).
 *   - **Already proven by the stage tests, cited rather than repeated:**
 *     REQ-NF-001 (an unguessable token — S2.2/S2.3 assert that a wrong token is
 *     404 and reveals nothing) and REQ-NF-008 (30-minute slots — S2.1's P8
 *     cases). N1 and N6 restate the observable part of each in one line, so the
 *     acceptance record can be read without following two other files.
 *   - **Not here at all:** REQ-NF-002, REQ-NF-003 and REQ-NF-004 are properties
 *     of a user interface this work does not build. They belong to SMS-36 and
 *     are recorded as out of scope in the gate, not silently skipped.
 *
 * **Why some checks read files instead of calling the API.** REQ-NF-005 and
 * REQ-NF-009 are absence constraints: "no automatic deletion" and "no payment
 * gateway" are claims about what the system does *not* contain. An API call can
 * only show that a thing is absent at the moment it is asked; reading the
 * sources and the dependency list is what makes the claim checkable. Those reads
 * are confined to `src/`, the migrations and `package.json` — the repository the
 * artifact is built from.
 *
 * Source: REQ-NF-001, REQ-NF-005, REQ-NF-006, REQ-NF-007, REQ-NF-008,
 *         REQ-NF-009; plan §2 ("Where the NFRs are discharged") and §8.3 (G4).
 * Contract: openapi.yaml — every parameter and schema property for NF-007.
 * Ticket: SMS-20 (Verification)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import request from 'supertest';
import type { Express } from 'express';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import {
  arrangeAdmin,
  arrangeLink,
  arrangeMaster,
  arrangeService,
  arrangeWeeklyWindow,
  unique,
} from '../helpers/booking.js';

const NOW = '2026-11-12T09:00:00+02:00';

/** The repository root, from this file's location. */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Every file under a directory, recursively. */
function walk(path: string): string[] {
  const entries = readdirSync(path);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(path, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

/** The TypeScript sources, excluding the contract bundle (a generated file). */
function sources(): string[] {
  return walk(join(ROOT, 'src')).filter(
    (file) => file.endsWith('.ts') && !file.endsWith('openapi.json'),
  );
}

/** The text of every source file, keyed by its path relative to the root. */
function sourceText(): { path: string; text: string }[] {
  return sources().map((file) => ({
    path: relative(ROOT, file),
    text: readFileSync(file, 'utf8'),
  }));
}

/**
 * Source text without its comments.
 *
 * REQ-NF-005 and REQ-NF-009 are claims about code, and prose uses the same words
 * ("the archive of what was booked", "retention"). Stripping comments keeps the
 * check on what the program does rather than on how it is described.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

let app: Express;
let adminToken: string;
let ownerToken: string;
let strangerToken: string;
let appointmentId: string;
let accessToken: string;

beforeAll(async () => {
  app = createApp({ now: () => new Date(NOW) });
  adminToken = (await arrangeAdmin(app)).token;

  const owner = await arrangeMaster(app, 'NFR Owner Master');
  ownerToken = owner.token;
  const stranger = await arrangeMaster(app, 'NFR Stranger Master');
  strangerToken = stranger.token;

  const service = await arrangeService(app, adminToken, {
    name: unique('nfr-service'),
    baseDurationMinutes: 30,
  });
  await arrangeLink(app, adminToken, owner.id, service.id, 40000);
  await arrangeWeeklyWindow(app, ownerToken, 1, '09:00', '21:00');

  const booked = await request(app)
    .post('/api/v1/admin/appointments')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      client: { name: 'NFR Client', phone: '+380509876543' },
      masterId: owner.id,
      serviceIds: [service.id],
      startAt: '2026-11-16T10:00:00+02:00',
    });
  expect(booked.status).toBe(201);
  appointmentId = booked.body.id as string;
  accessToken = booked.body.accessToken as string;
});

describe('REQ-NF-006 — client data is visible only to authorised parties', () => {
  it('N2 gives the client’s name and phone to the administrator, the owning master and the token holder only', async () => {
    // The administrator sees the record.
    const adminView = await request(app)
      .get(`/api/v1/admin/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminView.status).toBe(200);
    expect(adminView.body.client).toEqual({ name: 'NFR Client', phone: '+380509876543' });

    // The owning master sees it in their own calendar. The window is the
    // appointment's own day, so the case stays true whatever else the file
    // arranged for this master (N6 books another one later in November).
    const ownCalendar = await request(app)
      .get('/api/v1/me/appointments?from=2026-11-16&to=2026-11-16')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownCalendar.status).toBe(200);
    const ownEntry = ownCalendar.body.items.find((item: any) => item.id === appointmentId);
    expect(ownEntry?.client).toEqual({
      name: 'NFR Client',
      phone: '+380509876543',
    });

    // Another master does not: their calendar is their own (REQ-F-013), and the
    // appointment is not in it.
    const otherCalendar = await request(app)
      .get('/api/v1/me/appointments?from=2026-11-01&to=2026-11-30')
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(otherCalendar.status).toBe(200);
    expect(otherCalendar.body.total).toBe(0);
    expect(otherCalendar.body.items).toEqual([]);

    // The client sees their own record through their token.
    const clientView = await request(app).get(`/api/v1/appointments/${accessToken}`);
    expect(clientView.status).toBe(200);
    expect(clientView.body.client).toEqual({ name: 'NFR Client', phone: '+380509876543' });

    // No one else: the route is public but token-addressed, so a token that
    // names nothing is 404 — the refusal never says whether a token ever
    // existed, and there is no other way in.
    expect(
      (
        await request(app).get(
          '/api/v1/appointments/00000000-0000-4000-8000-000000000001',
        )
      ).status,
    ).toBe(404);
  });
});

describe('REQ-NF-007 — one location, one time zone, no selector', () => {
  it('N3 declares no location or time-zone parameter or field anywhere in the contract', () => {
    const contract = readFileSync(join(ROOT, 'src/contract/openapi.json'), 'utf8');
    const pattern = /"(?:name|([A-Za-z]+))"\s*:\s*"[^"]*(?:location|time_?zone|zone|offset|utc)[^"]*"/i;

    // Parameters and properties are the places a selector would have to appear:
    // a query parameter, a path parameter or a body field.
    const offenders = contract
      .split('\n')
      .filter((line) => pattern.test(line))
      // `timeZoneName` appears in nothing; `timeZone` would be the parameter.
      .filter((line) => !/SALON_TIME_ZONE|timeZone:|Europe\/Kyiv/.test(line));
    expect(offenders).toEqual([]);

    // And the time that *is* in the contract always carries its offset, so no
    // client is asked to guess a zone.
    const instants = contract.match(/"format": "date-time"/g) ?? [];
    expect(instants.length).toBeGreaterThan(0);
  });

  it('N3b answers every appointment instant with the salon offset, never a bare UTC time', async () => {
    const response = await request(app).get(`/api/v1/appointments/${accessToken}`);
    // November in Kyiv is +02:00; the body names it rather than leaving it out.
    expect(response.body.startAt).toBe('2026-11-16T10:00:00+02:00');
    expect(response.body.endAt).toBe('2026-11-16T10:30:00+02:00');
  });
});

describe('REQ-NF-005 — no automatic deletion', () => {
  it('N4 contains no purge job, retention schedule or destructive SQL', () => {
    const text = sourceText();

    const forbidden = [
      /\bnode-cron\b/,
      /\bsetInterval\s*\(/, // a repeating job would need one
      /\bpurge\b/i,
      /\bretention\b/i,
      /\barchive\b/i,
      /\bdelete\s+from\b/i,
      /\btruncate\b/i,
    ];

    const offenders = text.flatMap(({ path, text: body }) =>
      forbidden
        .filter((pattern) => pattern.test(stripComments(body)))
        .map((pattern) => `${path} matches ${pattern}`),
    );
    expect(offenders).toEqual([]);

    // The migrations are the schema's history: no destructive statement there
    // either (a drop would be a deletion policy expressed as DDL).
    const migrations = walk(join(ROOT, 'src/db/migrations'))
      .filter((file) => file.endsWith('.sql'))
      .flatMap((file) => {
        const body = readFileSync(file, 'utf8');
        return /\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b/i.test(body)
          ? [relative(ROOT, file)]
          : [];
      });
    expect(migrations).toEqual([]);

    // And no dependency could run one.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    expect(names.filter((name) => /cron|schedul|agenda|bull/i.test(name))).toEqual([]);
  });
});

describe('REQ-NF-009 — no payment gateway', () => {
  it('N5 has no payment-provider dependency and makes no outbound call', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    expect(names.filter((name) => /stripe|liqpay|monobank|wayforpay|fondy|paypal|adyen/i.test(name))).toEqual(
      [],
    );

    // No outbound HTTP at all: the only network edges are the database and the
    // socket this server listens on.
    const offenders = sourceText()
      .filter(({ path }) => !path.includes('contract/'))
      .filter(({ text }) => /\bfetch\s*\(|https?\.request\s*\(|axios/i.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);

    // And no provider host is named anywhere.
    const hosts = sourceText().flatMap(({ path, text }) =>
      /api\.(stripe|liqpay|monobank|wayforpay|fondy)\.com|checkout\./i.test(text) ? [path] : [],
    );
    expect(hosts).toEqual([]);
  });
});

describe('REQ-NF-001 and REQ-NF-008 — restated in one line each', () => {
  it('N1 hands the client a random token and never discloses it to staff', async () => {
    expect(accessToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(accessToken).not.toBe(appointmentId);

    const adminView = await request(app)
      .get(`/api/v1/admin/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminView.body.accessToken).toBeUndefined();
    expect(adminView.body.confirmationUrl).toBeUndefined();

    const masterView = await request(app)
      .get('/api/v1/me/appointments?from=2026-11-16&to=2026-11-16')
      .set('Authorization', `Bearer ${ownerToken}`);
    const staffEntry = masterView.body.items.find((item: any) => item.id === appointmentId);
    expect(staffEntry?.accessToken).toBeUndefined();
  });

  it('N6 accepts only start times on a 30-minute boundary (REQ-NF-008)', async () => {
    const service = await request(app)
      .post('/api/v1/admin/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: unique('nfr-boundary'), category: 'Hair', baseDurationMinutes: 30 });

    const masters = await request(app)
      .get('/api/v1/admin/masters?page=1&pageSize=100')
      .set('Authorization', `Bearer ${adminToken}`);
    const masterId = masters.body.items.find((item: any) => item.fullName === 'NFR Owner Master').id;

    await arrangeLink(app, adminToken, masterId, service.body.id, 20000);

    const body = (startAt: string) => ({
      client: { name: 'NFR Boundary Client', phone: '+380501112233' },
      masterId,
      serviceIds: [service.body.id],
      startAt,
    });

    const offGrid = await request(app)
      .post('/api/v1/admin/appointments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body('2026-11-23T10:15:00+02:00'));
    expect(offGrid.status).toBe(422);
    // S2.1's D3: the body is well formed, the slot rule is what it breaks.
    expect(offGrid.body.code).toBe('BUSINESS_RULE_VIOLATION');

    const onGrid = await request(app)
      .post('/api/v1/admin/appointments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body('2026-11-23T10:00:00+02:00'));
    expect(onGrid.status).toBe(201);
  });
});
