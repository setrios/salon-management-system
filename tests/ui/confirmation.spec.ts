/**
 * C2 — Your appointment, the Confirmation Page (`/appointments/{token}`).
 *
 *   P1  the SMS link (confirmationUrl) opens the page with the appointment
 *   P2  cancelling asks first; "Keep it" changes nothing
 *   P3  "Yes, cancel" cancels: banner, status, controls disabled — and the
 *       link still opens the page afterwards (glossary, Confirmation Page)
 *   P4  a completed appointment: controls disabled, with the reason
 *   P5  an unknown token: the not-found message
 *   P6  Reschedule opens C3
 *
 * Source: REQ-F-004, 005, 006; REQ-NF-001, 004, 006; SCN-01, SCN-02;
 *         SRS v1.3 glossary "Confirmation Page"; spec/ui/screens.md §4.2.
 * Ticket: SMS-57 (Test) → SMS-36 (Feature)
 */

import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import {
  book,
  complete,
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
import { dateLabel, salonDate, salonInstant, timeOf } from './support/time.js';

const DAY = salonDate(12);

let adminToken: string;
let anna: Staff;
let haircut: ServiceFixture;
let nextHour = 9;

test.beforeAll(async ({ request }) => {
  await resetDatabase();
  adminToken = await signInAdmin(request);
  anna = await createMaster(request, adminToken, 'Anna Koval');
  haircut = await createService(request, adminToken, 'Haircut', 45);
  await linkService(request, adminToken, anna.id, haircut.id, 500);
  await workEveryDay(request, anna, '09:00', '20:00');
});

/** Books a fresh appointment for each test, an hour apart. */
async function bookOne(request: Parameters<typeof book>[0]) {
  const time = `${String(nextHour++).padStart(2, '0')}:00`;
  return book(request, {
    masterId: anna.id,
    serviceIds: [haircut.id],
    startAt: salonInstant(DAY, time),
    name: 'Olena Shevchenko',
    phone: '+380501112233',
  });
}

function controls(page: Page) {
  return {
    reschedule: page.getByRole('button', { name: 'Reschedule' }),
    cancel: page.getByRole('button', { name: 'Cancel appointment' }),
  };
}

test('P1 the SMS link opens the page with the appointment', async ({ page, request }) => {
  const booked = await bookOne(request);
  const read = await getJson<{ endAt: string }>(
    request,
    `/api/v1/appointments/${booked.accessToken}`,
  );

  await page.goto(booked.confirmationUrl);

  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(
    page.getByText(`${dateLabel(DAY)}, ${timeOf(booked.startAt)}–${timeOf(read.endAt)}`),
  ).toBeVisible();
  await expect(page.getByText('Anna Koval')).toBeVisible();
  await expect(page.getByText('Haircut')).toBeVisible();
  await expect(page.getByText('45 min')).toBeVisible();
  await expect(page.getByText('500.00 UAH').first()).toBeVisible();
  await expect(page.getByText('Olena Shevchenko')).toBeVisible();
  await expect(page.getByText('+380501112233')).toBeVisible();
  await expect(controls(page).reschedule).toBeEnabled();
  await expect(controls(page).cancel).toBeEnabled();
  await expectInterfaceRules(page);
});

test('P2 asks before cancelling, and "Keep it" changes nothing', async ({ page, request }) => {
  const booked = await bookOne(request);
  await page.goto(booked.confirmationUrl);

  await controls(page).cancel.click();
  await expect(page.getByText('Cancel this appointment? It is free of charge.')).toBeVisible();
  await page.getByRole('button', { name: 'Keep it' }).click();

  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  const read = await getJson<{ status: string }>(
    request,
    `/api/v1/appointments/${booked.accessToken}`,
  );
  expect(read.status).toBe('confirmed');
});

test('P3 cancels, disables the controls, and the link still opens', async ({ page, request }) => {
  const booked = await bookOne(request);
  await page.goto(booked.confirmationUrl);

  await controls(page).cancel.click();
  await page.getByRole('button', { name: 'Yes, cancel' }).click();

  await expect(page.getByText('Your appointment is cancelled.')).toBeVisible();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(page.getByText('This appointment was cancelled.')).toBeVisible();
  await expect(controls(page).reschedule).toBeDisabled();
  await expect(controls(page).cancel).toBeDisabled();

  const read = await getJson<{ status: string }>(
    request,
    `/api/v1/appointments/${booked.accessToken}`,
  );
  expect(read.status).toBe('cancelled');

  await page.goto(booked.confirmationUrl);
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(controls(page).cancel).toBeDisabled();
});

test('P4 shows a completed appointment without controls', async ({ page, request }) => {
  const booked = await bookOne(request);
  await complete(request, adminToken, booked.id);
  await page.goto(booked.confirmationUrl);

  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
  await expect(page.getByText('This appointment has taken place.')).toBeVisible();
  await expect(controls(page).reschedule).toBeDisabled();
  await expect(controls(page).cancel).toBeDisabled();
});

test('P5 says so for an unknown token', async ({ page }) => {
  await page.goto(`/appointments/${randomUUID()}`);
  await expect(
    page.getByText('We could not find this appointment. Check the link from your SMS.'),
  ).toBeVisible();
});

test('P6 Reschedule opens the reschedule page', async ({ page, request }) => {
  const booked = await bookOne(request);
  await page.goto(booked.confirmationUrl);
  await controls(page).reschedule.click();
  await expect(page).toHaveURL(new RegExp(`/appointments/${booked.accessToken}/reschedule$`));
});
