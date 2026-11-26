/**
 * The master's screens, and the two screens both roles share.
 *
 *   W1  M1 My calendar shows the master's own appointments, with the client
 *       (REQ-F-013, REQ-NF-006) — and no other master's
 *   W2  M2 My services lists exactly the master's links, prices in UAH
 *   W3  M3 My availability: a date rule added and saved is stored by M4
 *   W4  N2 switching one event × channel changes only that one (REQ-F-026)
 *   W5  N1 lists the notification a booking produced for the master
 *
 * Source: REQ-F-013, 014, 015, 016, 026; REQ-NF-004, 006;
 *         spec/ui/screens.md §5.1, §5.2.
 * Ticket: SMS-57 (Test) → SMS-36 (Feature)
 */

import { expect, test } from '@playwright/test';

import {
  book,
  createMaster,
  createService,
  getJson,
  linkService,
  signInAdmin,
  workEveryDay,
  type Staff,
} from './support/api.js';
import { expectInterfaceRules } from './support/checks.js';
import { resetDatabase } from './support/db.js';
import { openFromMenu, preferenceSwitch, row, signInUi } from './support/staff.js';
import { salonDate, salonInstant } from './support/time.js';

const DAY = salonDate(18);
const DATE_RULE = salonDate(25);

let anna: Staff;
let ivan: Staff;

interface Preference {
  readonly channel: string;
  readonly eventType: string;
  readonly enabled: boolean;
}

test.beforeAll(async ({ request }) => {
  await resetDatabase();
  const admin = await signInAdmin(request);
  anna = await createMaster(request, admin, 'Anna Koval');
  ivan = await createMaster(request, admin, 'Ivan Bondar');
  const haircut = await createService(request, admin, 'Haircut', 45);
  const coloring = await createService(request, admin, 'Root coloring', 60, 'Coloring');
  await linkService(request, admin, anna.id, haircut.id, 500);
  await linkService(request, admin, anna.id, coloring.id, 900);
  await linkService(request, admin, ivan.id, haircut.id, 450);
  await workEveryDay(request, anna);
  await workEveryDay(request, ivan);

  await book(request, {
    masterId: anna.id,
    serviceIds: [haircut.id],
    startAt: salonInstant(DAY, '10:00'),
    name: 'Olena Shevchenko',
    phone: '+380501112233',
  });
  await book(request, {
    masterId: ivan.id,
    serviceIds: [haircut.id],
    startAt: salonInstant(DAY, '11:00'),
    name: 'Petro Hnatiuk',
    phone: '+380502223344',
  });
});

test.beforeEach(async ({ page }) => {
  await signInUi(page, anna.username, anna.password);
});

test("W1 My calendar shows the master's own appointments only", async ({ page }) => {
  await page.getByLabel('From').fill(DAY);
  await page.getByLabel('To').fill(DAY);

  await expect(page.getByText('Olena Shevchenko')).toBeVisible();
  await expect(page.getByText('+380501112233')).toBeVisible();
  await expect(page.getByText('Haircut')).toBeVisible();
  await expect(page.getByText('Petro Hnatiuk')).toHaveCount(0);
  await expectInterfaceRules(page);
});

test("W2 My services lists exactly the master's services", async ({ page }) => {
  await openFromMenu(page, 'My services');

  await expect(row(page, 'Haircut', '500.00 UAH')).toHaveCount(1);
  await expect(row(page, 'Root coloring', '900.00 UAH')).toHaveCount(1);
  await expect(row(page, '450.00 UAH')).toHaveCount(0);
  await expectInterfaceRules(page);
});

test('W3 My availability saves a date rule through M4', async ({ page, request }) => {
  await openFromMenu(page, 'My availability');

  const dates = page.getByRole('region', { name: 'Specific dates' });
  await dates.getByRole('button', { name: 'Add' }).click();
  await dates.getByLabel('Date').last().fill(DATE_RULE);
  await dates.getByLabel('From').last().fill('12:00');
  await dates.getByLabel('To').last().fill('16:00');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect
    .poll(async () => {
      const stored = await getJson<{ weekly: unknown[]; dates: unknown[] }>(
        request,
        '/api/v1/me/availability',
        anna.token,
      );
      return { weekly: stored.weekly.length, dates: stored.dates };
    })
    .toEqual({
      weekly: 7,
      dates: [{ date: DATE_RULE, startTime: '12:00', endTime: '16:00' }],
    });
});

test('W4 Notification settings change only the switched cell', async ({ page, request }) => {
  const before = await getJson<Preference[]>(
    request,
    '/api/v1/me/notification-preferences',
    anna.token,
  );
  await openFromMenu(page, 'Notification settings');

  const cell = preferenceSwitch(page, 'Reschedule', 'SMS');
  await expect(cell).toBeChecked();
  await cell.click();
  await expect(page.getByText('Saved.')).toBeVisible();

  const after = await getJson<Preference[]>(
    request,
    '/api/v1/me/notification-preferences',
    anna.token,
  );
  const expected = before.map((item) =>
    item.channel === 'sms' && item.eventType === 'reschedule' ? { ...item, enabled: false } : item,
  );
  expect(after).toEqual(expected);
});

test('W5 Notifications lists what a booking produced for the master', async ({ page }) => {
  await openFromMenu(page, 'Notifications');
  await expect(row(page, 'New').first()).toBeVisible();
  await expectInterfaceRules(page);
});
