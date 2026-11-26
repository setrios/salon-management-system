/**
 * C3 — Reschedule (`/appointments/{token}/reschedule`).
 *
 * The same order as C1 (UI-GATE U-2): the time first, then the master among
 * the eligible masters free at it — the current master first, preselected when
 * free.
 *
 *   R1  shows the current time and master
 *   R2  a new time with the same master → C2, banner, the new time stored
 *   R3  a time the current master has taken → another master, stored
 *   R4  a cancelled appointment → "can no longer be changed", link to C2
 *   R5  "Back to my appointment" returns to C2
 *
 * Source: REQ-F-007, 008, 009, 029; SCN-03, SCN-11; spec/ui/screens.md §4.3;
 *         error-model.md §3.1 (409 INVALID_STATE_TRANSITION).
 * Ticket: SMS-57 (Test) → SMS-36 (Feature)
 */

import { expect, test, type Page } from '@playwright/test';

import {
  book,
  cancelByToken,
  createMaster,
  createService,
  getJson,
  linkService,
  signInAdmin,
  workEveryDay,
  type ServiceFixture,
  type Staff,
} from './support/api.js';
import { expectInterfaceRules } from './support/checks.js';
import { resetDatabase } from './support/db.js';
import { dateLabel, salonDate, salonInstant } from './support/time.js';

const DAY = salonDate(14);
const NEW_DAY = salonDate(15);

let anna: Staff;
let ivan: Staff;
let haircut: ServiceFixture;
let nextHour = 9;

test.beforeAll(async ({ request }) => {
  await resetDatabase();
  const admin = await signInAdmin(request);
  anna = await createMaster(request, admin, 'Anna Koval');
  ivan = await createMaster(request, admin, 'Ivan Bondar');
  haircut = await createService(request, admin, 'Haircut', 45);
  await linkService(request, admin, anna.id, haircut.id, 500);
  await linkService(request, admin, ivan.id, haircut.id, 450);
  await workEveryDay(request, anna, '09:00', '20:00');
  await workEveryDay(request, ivan, '09:00', '20:00');
});

async function bookWithAnna(request: Parameters<typeof book>[0]) {
  const time = `${String(nextHour++).padStart(2, '0')}:00`;
  return book(request, {
    masterId: anna.id,
    serviceIds: [haircut.id],
    startAt: salonInstant(DAY, time),
  });
}

async function chooseTime(page: Page, date: string, time: string): Promise<void> {
  await page.getByLabel('New date').fill(date);
  await page.getByRole('button', { name: time, exact: true }).click();
}

function masterChoice(page: Page, fullName: string) {
  return page.getByRole('radio', { name: new RegExp(fullName) });
}

test('R1 shows the current time and master', async ({ page, request }) => {
  const booked = await bookWithAnna(request);
  await page.goto(`/appointments/${booked.accessToken}/reschedule`);

  await expect(page.getByText(`${dateLabel(DAY)}, ${booked.startAt.slice(11, 16)}`)).toBeVisible();
  await expect(page.getByText('Anna Koval')).toBeVisible();
  await expectInterfaceRules(page);
});

test('R2 moves the appointment to a new time with the same master', async ({ page, request }) => {
  const booked = await bookWithAnna(request);
  await page.goto(`/appointments/${booked.accessToken}/reschedule`);

  await chooseTime(page, NEW_DAY, '11:00');
  await expect(masterChoice(page, 'Anna Koval')).toBeChecked();
  await page.getByRole('button', { name: 'Confirm new time' }).click();

  await expect(page).toHaveURL(new RegExp(`/appointments/${booked.accessToken}$`));
  await expect(page.getByText('Your appointment has been rescheduled.')).toBeVisible();
  await expect(page.getByText(`${dateLabel(NEW_DAY)}, 11:00`, { exact: false })).toBeVisible();

  const read = await getJson<{ startAt: string; master: { id: string } }>(
    request,
    `/api/v1/appointments/${booked.accessToken}`,
  );
  expect(read.startAt).toBe(salonInstant(NEW_DAY, '11:00'));
  expect(read.master.id).toBe(anna.id);
});

test('R3 moves to another master when the current one is taken', async ({ page, request }) => {
  const booked = await bookWithAnna(request);
  await book(request, {
    masterId: anna.id,
    serviceIds: [haircut.id],
    startAt: salonInstant(NEW_DAY, '15:00'),
  });
  await page.goto(`/appointments/${booked.accessToken}/reschedule`);

  await chooseTime(page, NEW_DAY, '15:00');
  await expect(masterChoice(page, 'Anna Koval')).toHaveCount(0);
  await masterChoice(page, 'Ivan Bondar').check();
  await page.getByRole('button', { name: 'Confirm new time' }).click();

  await expect(page.getByText('Your appointment has been rescheduled.')).toBeVisible();
  await expect(page.getByText('Ivan Bondar')).toBeVisible();
  const read = await getJson<{ master: { id: string } }>(
    request,
    `/api/v1/appointments/${booked.accessToken}`,
  );
  expect(read.master.id).toBe(ivan.id);
});

test('R4 refuses a cancelled appointment and links back', async ({ page, request }) => {
  const booked = await bookWithAnna(request);
  await cancelByToken(request, booked.accessToken);
  await page.goto(`/appointments/${booked.accessToken}/reschedule`);

  await chooseTime(page, NEW_DAY, '17:00');
  await masterChoice(page, 'Anna Koval').check();
  await page.getByRole('button', { name: 'Confirm new time' }).click();

  await expect(page.getByText('This appointment can no longer be changed.')).toBeVisible();
  await page.getByRole('link', { name: 'Back to my appointment' }).click();
  await expect(page).toHaveURL(new RegExp(`/appointments/${booked.accessToken}$`));
});

test('R5 "Back to my appointment" returns to the confirmation page', async ({ page, request }) => {
  const booked = await bookWithAnna(request);
  await page.goto(`/appointments/${booked.accessToken}/reschedule`);
  await page.getByRole('link', { name: 'Back to my appointment' }).click();
  await expect(page).toHaveURL(new RegExp(`/appointments/${booked.accessToken}$`));
});
