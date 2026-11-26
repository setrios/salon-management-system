/**
 * C1 — Book an appointment (`/`), desktop viewport.
 *
 * Steps in the order of UI-GATE U-2: services → date and time → master →
 * details. An eligible master offers every ticked service; the time step shows
 * the union of the eligible masters' free slots; the master step lists those
 * free at the chosen slot, each with their own total price.
 *
 *   B1  only services some active master offers; ticking sums the duration
 *   B2  no master offers the combination → message, the date step stays disabled
 *   B3  slots: 30-minute starts that fit the rounded block, union of the masters
 *   B4  a slot every eligible master has taken is not offered
 *   B5  the master step lists only masters free at the slot, with their price
 *   B6  Book → the confirmation page at confirmationUrl, confirmed
 *   B7  the slot taken meanwhile → 409 message, the master step cleared
 *   B8  an invalid phone → the Phone field is marked, nothing is booked
 *   B9  changing an earlier step clears the later ones
 *
 * Source: REQ-F-001, 002, 003, 004, 031; REQ-NF-008; SCN-01, SCN-13;
 *         spec/ui/screens.md §4.1; UI-GATE U-2, U-4.
 * Ticket: SMS-57 (Test) → SMS-36 (Feature)
 */

import { expect, test, type Page } from '@playwright/test';

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
import { expectInterfaceRules } from './support/checks.js';
import { resetDatabase } from './support/db.js';
import { salonDate, salonInstant } from './support/time.js';

const DAY = salonDate(10);

let anna: Staff;
let ivan: Staff;
let haircut: ServiceFixture;
let beard: ServiceFixture;
let coloring: ServiceFixture;
let hotTowel: ServiceFixture;

test.beforeAll(async ({ request }) => {
  await resetDatabase();
  const admin = await signInAdmin(request);

  anna = await createMaster(request, admin, 'Anna Koval');
  ivan = await createMaster(request, admin, 'Ivan Bondar');
  haircut = await createService(request, admin, 'Haircut', 45);
  beard = await createService(request, admin, 'Beard trim', 30, 'Barbering');
  coloring = await createService(request, admin, 'Root coloring', 60, 'Coloring');
  hotTowel = await createService(request, admin, 'Hot towel shave', 30, 'Barbering');
  await createService(request, admin, 'Manicure', 30, 'Nails'); // nobody offers it

  await linkService(request, admin, anna.id, haircut.id, 500);
  await linkService(request, admin, anna.id, beard.id, 300);
  await linkService(request, admin, anna.id, coloring.id, 900);
  await linkService(request, admin, ivan.id, haircut.id, 450);
  await linkService(request, admin, ivan.id, beard.id, 250);
  await linkService(request, admin, ivan.id, hotTowel.id, 200);

  await workEveryDay(request, anna);
  await workEveryDay(request, ivan);

  // B4: 12:00 is taken for both masters who can do haircut + beard trim.
  for (const master of [anna, ivan]) {
    await book(request, {
      masterId: master.id,
      serviceIds: [haircut.id],
      startAt: salonInstant(DAY, '12:00'),
    });
  }
});

function step(page: Page, name: string) {
  return page.getByRole('region', { name });
}

async function chooseServices(page: Page, ...names: string[]): Promise<void> {
  for (const name of names) {
    await step(page, 'Choose services')
      .getByRole('checkbox', { name: new RegExp(name) })
      .check();
  }
}

async function chooseDate(page: Page, date: string): Promise<void> {
  await step(page, 'Choose a date and time').getByLabel('Date').fill(date);
}

function slot(page: Page, time: string) {
  return step(page, 'Choose a date and time').getByRole('button', { name: time, exact: true });
}

function master(page: Page, fullName: string) {
  return step(page, 'Choose a master').getByRole('radio', { name: new RegExp(fullName) });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('B1 lists only services some master offers, and sums the duration', async ({ page }) => {
  const services = step(page, 'Choose services');
  await expect(services.getByRole('checkbox', { name: /Haircut/ })).toBeVisible();
  await expect(services.getByRole('checkbox', { name: /Root coloring/ })).toBeVisible();
  await expect(services.getByRole('checkbox', { name: /Manicure/ })).toHaveCount(0);

  await chooseServices(page, 'Haircut', 'Beard trim');
  await expect(services).toContainText('Total duration: 75 min');
  await expectInterfaceRules(page);
});

test('B2 says so when no master offers the combination', async ({ page }) => {
  await chooseServices(page, 'Root coloring', 'Hot towel shave');
  await expect(
    page.getByText(
      'No master offers all of these services together. Remove a service to continue.',
    ),
  ).toBeVisible();
  await expect(step(page, 'Choose a date and time').getByLabel('Date')).toBeDisabled();
});

test('B3 offers 30-minute starts that fit the rounded block', async ({ page }) => {
  // 45 + 30 = 75 minutes, occupying a 90-minute block (REQ-F-031): the last
  // start inside 09:00–18:00 is 16:30.
  await chooseServices(page, 'Haircut', 'Beard trim');
  await chooseDate(page, DAY);

  await expect(slot(page, '09:00')).toBeVisible();
  await expect(slot(page, '16:30')).toBeVisible();
  await expect(slot(page, '17:00')).toHaveCount(0);
  for (const name of await step(page, 'Choose a date and time')
    .getByRole('button', { name: /^\d{2}:\d{2}$/ })
    .allInnerTexts()) {
    expect(name).toMatch(/^\d{2}:(00|30)$/);
  }
});

test('B4 does not offer a slot every eligible master has taken', async ({ page }) => {
  await chooseServices(page, 'Haircut');
  await chooseDate(page, DAY);
  await expect(slot(page, '10:00')).toBeVisible();
  await expect(slot(page, '12:00')).toHaveCount(0);
});

test('B5 lists the masters free at the slot, each with their total price', async ({
  page,
  request,
}) => {
  // Ivan is taken at 09:00 on this date; Anna is not.
  const otherDay = salonDate(11);
  await book(request, {
    masterId: ivan.id,
    serviceIds: [haircut.id],
    startAt: salonInstant(otherDay, '09:00'),
  });

  await chooseServices(page, 'Haircut', 'Beard trim');
  await chooseDate(page, otherDay);

  await slot(page, '09:00').click();
  await expect(master(page, 'Anna Koval')).toBeVisible();
  await expect(master(page, 'Anna Koval')).toHaveAccessibleName(/800\.00 UAH/);
  await expect(master(page, 'Ivan Bondar')).toHaveCount(0);

  await slot(page, '14:00').click();
  await expect(master(page, 'Anna Koval')).toHaveAccessibleName(/800\.00 UAH/);
  await expect(master(page, 'Ivan Bondar')).toHaveAccessibleName(/700\.00 UAH/);
  await expectInterfaceRules(page);
});

test('B6 books and opens the confirmation page at confirmationUrl', async ({ page, request }) => {
  await chooseServices(page, 'Haircut', 'Beard trim');
  await chooseDate(page, DAY);
  await slot(page, '14:00').click();
  await master(page, 'Ivan Bondar').check();

  const details = step(page, 'Your details');
  await details.getByLabel('Name').fill('Iryna Kovalenko');
  await details.getByLabel('Phone').fill('+380671234567');
  await expect(details).toContainText('Total duration: 75 min');
  await expect(details).toContainText('Total price: 700.00 UAH');
  await details.getByRole('button', { name: 'Book' }).click();

  await expect(page).toHaveURL(/\/appointments\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Your appointment is confirmed.')).toBeVisible();
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(page.getByText('Ivan Bondar')).toBeVisible();

  // The page is the one the SMS link points to (SMS-70): P9 by the same token.
  const token = new URL(page.url()).pathname.split('/').pop() ?? '';
  const appointment = await getJson<{ status: string; confirmationUrl: string }>(
    request,
    `/api/v1/appointments/${token}`,
  );
  expect(appointment.status).toBe('confirmed');
  expect(appointment.confirmationUrl).toBe(page.url());
});

test('B7 reports a slot taken meanwhile and clears the master step', async ({ page, request }) => {
  await chooseServices(page, 'Haircut');
  await chooseDate(page, DAY);
  await slot(page, '15:00').click();
  await master(page, 'Anna Koval').check();
  const details = step(page, 'Your details');
  await details.getByLabel('Name').fill('Iryna Kovalenko');
  await details.getByLabel('Phone').fill('+380671234567');

  await book(request, {
    masterId: anna.id,
    serviceIds: [haircut.id],
    startAt: salonInstant(DAY, '15:00'),
  });
  await details.getByRole('button', { name: 'Book' }).click();

  await expect(
    page.getByText('This time is no longer available. Please choose another time.'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(step(page, 'Choose a master').getByRole('radio', { checked: true })).toHaveCount(0);
});

test('B8 marks an invalid phone and books nothing', async ({ page }) => {
  await chooseServices(page, 'Haircut');
  await chooseDate(page, DAY);
  await slot(page, '16:00').click();
  await master(page, 'Anna Koval').check();
  const details = step(page, 'Your details');
  await details.getByLabel('Name').fill('Iryna Kovalenko');
  await details.getByLabel('Phone').fill('call me');
  await details.getByRole('button', { name: 'Book' }).click();

  await expect(details.getByLabel('Phone')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/$/);
});

test('B9 clears the later steps when an earlier one changes', async ({ page }) => {
  await chooseServices(page, 'Haircut');
  await chooseDate(page, DAY);
  await slot(page, '10:00').click();
  await master(page, 'Anna Koval').check();

  await step(page, 'Choose services')
    .getByRole('checkbox', { name: /Beard trim/ })
    .check();

  await expect(step(page, 'Choose a master').getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(step(page, 'Your details').getByRole('button', { name: 'Book' })).toBeDisabled();
});
