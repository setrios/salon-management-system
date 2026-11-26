/**
 * SMS-73 — times are entered in the 24-hour format, whatever the browser's locale.
 *
 * UI-GATE U-4 fixes the time format as `10:00`, 24-hour. M3 My availability
 * used the browser's native time control, which a browser renders in its own
 * locale: under `en-US` the developer saw "09:00 AM / 06:00 PM" pickers during
 * the hands-on check before G5 (2026-11-26), and a time typed the 24-hour way
 * did not go in. These cases run with the browser's locale set to `en-US` on
 * purpose, the locale in which the defect shows.
 *
 *   T1  each time field of M3 says how to write a time: placeholder `HH:MM`
 *   T2  a 24-hour time typed in a weekly row (`18:30`) is saved as `18:30`
 *   T3  a 12-hour time (`6:30 PM`) is refused at the field, and nothing is saved
 *
 * Source: UI-GATE U-4 (logs/gates/2026-11-26-ui-gate.md); REQ-F-015;
 *         REQ-NF-003; spec/ui/screens.md §5.2 (M3), §11 K7.
 * Ticket: SMS-73 (Test)
 */

import { expect, test } from '@playwright/test';

import {
  createMaster,
  createService,
  getJson,
  linkService,
  signInAdmin,
  type Staff,
} from './support/api.js';
import { resetDatabase } from './support/db.js';
import { openFromMenu, signInUi } from './support/staff.js';

test.use({ locale: 'en-US' });

let anna: Staff;

interface Stored {
  readonly weekly: ReadonlyArray<{ dayOfWeek: number; startTime: string; endTime: string }>;
  readonly dates: readonly unknown[];
}

test.beforeAll(async ({ request }) => {
  await resetDatabase();
  const admin = await signInAdmin(request);
  anna = await createMaster(request, admin, 'Anna Koval');
  const haircut = await createService(request, admin, 'Haircut', 45);
  await linkService(request, admin, anna.id, haircut.id, 500);
});

test.beforeEach(async ({ page }) => {
  await signInUi(page, anna.username, anna.password);
  await openFromMenu(page, 'My availability');
});

test('T1 every time field asks for HH:MM', async ({ page }) => {
  await page
    .getByRole('region', { name: 'Weekly hours' })
    .getByRole('button', { name: 'Add' })
    .click();
  await page
    .getByRole('region', { name: 'Specific dates' })
    .getByRole('button', { name: 'Add' })
    .click();

  for (const label of ['From', 'To']) {
    for (const field of await page.getByLabel(label, { exact: true }).all()) {
      await expect(field).toHaveAttribute('placeholder', 'HH:MM');
    }
  }
});

test('T2 a 24-hour time is saved as typed', async ({ page, request }) => {
  const weekly = page.getByRole('region', { name: 'Weekly hours' });
  await weekly.getByRole('button', { name: 'Add' }).click();
  await weekly.getByLabel('Day').last().selectOption({ label: 'Tuesday' });
  await weekly.getByLabel('From', { exact: true }).last().fill('09:00');
  await weekly.getByLabel('To', { exact: true }).last().fill('18:30');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  const stored = await getJson<Stored>(request, '/api/v1/me/availability', anna.token);
  expect(stored.weekly).toContainEqual({ dayOfWeek: 2, startTime: '09:00', endTime: '18:30' });
});

test('T3 a 12-hour time is refused at the field and nothing is saved', async ({
  page,
  request,
}) => {
  const before = await getJson<Stored>(request, '/api/v1/me/availability', anna.token);

  const weekly = page.getByRole('region', { name: 'Weekly hours' });
  await weekly.getByRole('button', { name: 'Add' }).click();
  await weekly.getByLabel('From', { exact: true }).last().fill('9:00 AM');
  await weekly.getByLabel('To', { exact: true }).last().fill('6:30 PM');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(weekly.getByLabel('To', { exact: true }).last()).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByText('Saved.')).toHaveCount(0);
  const after = await getJson<Stored>(request, '/api/v1/me/availability', anna.token);
  expect(after).toEqual(before);
});
