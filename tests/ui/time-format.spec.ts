/**
 * SMS-79 — times follow the browser's own hour cycle, and M3 enters them with
 * the browser's time control.
 *
 * UI-GATE U-4 first fixed every time as `10:00`, 24-hour, and SMS-73 made M3's
 * fields text fields to force it. At the final validation (2026-11-27) the
 * developer amended U-4: the browser's own format is easier to choose. A time
 * is now shown in the browser's hour cycle — `10:00 AM` in a 12-hour browser,
 * `10:00` in a 24-hour one — always in English (REQ-NF-003) and always the
 * salon's wall clock; M3's fields are the browser's time control again.
 *
 * The other browser tests run with `en-GB` (24-hour, playwright.config.ts) and
 * so cover that cycle; this file runs with `en-US`, the 12-hour one.
 *
 * The 12-hour picker is where the developer's first master saved no working
 * hours (SMS-73 §1): an end before the start was refused by the server and
 * nothing was stored. H4 guards that case in the interface itself.
 *
 *   H1  C1's slot buttons read `10:00 AM`, `2:30 PM`
 *   H2  C2's When reads `…, 10:00 AM–10:45 AM`
 *   H3  M3's From / To are time controls, and a time chosen there is stored as
 *       the contract's `HH:MM` (`09:00`, `18:30`)
 *   H4  a row whose To is not after its From is marked with "The end time must
 *       be after the start time." and nothing is saved
 *
 * Source: UI-GATE U-4 as amended (spec/ui/screens.md §9); REQ-F-002, REQ-F-004,
 *         REQ-F-015, REQ-NF-003; screens.md §4.1, §4.2, §5.2 (M3), §11 K7.
 * Ticket: SMS-79 (Test)
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
  type ServiceFixture,
  type Staff,
} from './support/api.js';
import { resetDatabase } from './support/db.js';
import { openFromMenu, signInUi } from './support/staff.js';
import { dateLabel, salonDate, salonInstant } from './support/time.js';

test.use({ locale: 'en-US' });

const DAY = salonDate(12);

let anna: Staff;
let haircut: ServiceFixture;

interface Stored {
  readonly weekly: ReadonlyArray<{ dayOfWeek: number; startTime: string; endTime: string }>;
  readonly dates: readonly unknown[];
}

test.beforeAll(async ({ request }) => {
  await resetDatabase();
  const admin = await signInAdmin(request);
  anna = await createMaster(request, admin, 'Anna Koval');
  haircut = await createService(request, admin, 'Haircut', 45);
  await linkService(request, admin, anna.id, haircut.id, 500);
  await workEveryDay(request, anna);
});

test('H1 slot buttons follow the 12-hour cycle', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Choose services' })
    .getByRole('checkbox', { name: /Haircut/ })
    .check();
  const when = page.getByRole('region', { name: 'Choose a date and time' });
  await when.getByLabel('Date').fill(DAY);

  await expect(when.getByRole('button', { name: '10:00 AM', exact: true })).toBeVisible();
  await expect(when.getByRole('button', { name: '2:30 PM', exact: true })).toBeVisible();
  await expect(when.getByRole('button', { name: '14:30', exact: true })).toHaveCount(0);
});

test('H2 the confirmation page shows When in the 12-hour cycle', async ({ page, request }) => {
  const booked = await book(request, {
    masterId: anna.id,
    serviceIds: [haircut.id],
    startAt: salonInstant(DAY, '10:00'),
  });
  await page.goto(booked.confirmationUrl);

  await expect(page.getByText(`${dateLabel(DAY)}, 10:00 AM–10:45 AM`)).toBeVisible();
});

test('H3 M3 uses time controls and stores HH:MM', async ({ page, request }) => {
  await signInUi(page, anna.username, anna.password);
  await openFromMenu(page, 'My availability');

  const weekly = page.getByRole('region', { name: 'Weekly hours' });
  await weekly.getByRole('button', { name: 'Add' }).click();
  const from = weekly.getByLabel('From', { exact: true }).last();
  const to = weekly.getByLabel('To', { exact: true }).last();
  await expect(from).toHaveAttribute('type', 'time');
  await expect(to).toHaveAttribute('type', 'time');

  await weekly.getByLabel('Day').last().selectOption({ label: 'Tuesday' });
  await from.fill('09:00');
  await to.fill('18:30');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  const stored = await getJson<Stored>(request, '/api/v1/me/availability', anna.token);
  expect(stored.weekly).toContainEqual({ dayOfWeek: 2, startTime: '09:00', endTime: '18:30' });
});

test('H4 an end not after its start is marked and nothing is saved', async ({ page, request }) => {
  const before = await getJson<Stored>(request, '/api/v1/me/availability', anna.token);
  await signInUi(page, anna.username, anna.password);
  await openFromMenu(page, 'My availability');

  const weekly = page.getByRole('region', { name: 'Weekly hours' });
  await weekly.getByRole('button', { name: 'Add' }).click();
  await weekly.getByLabel('From', { exact: true }).last().fill('18:00');
  await weekly.getByLabel('To', { exact: true }).last().fill('06:00');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(weekly.getByLabel('To', { exact: true }).last()).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByText('The end time must be after the start time.')).toBeVisible();
  await expect(page.getByText('Saved.')).toHaveCount(0);
  expect(await getJson<Stored>(request, '/api/v1/me/availability', anna.token)).toEqual(before);
});
