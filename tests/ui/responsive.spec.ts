/**
 * REQ-NF-002 — the client screens on a mobile viewport (375 × 812, UI-GATE U-5).
 *
 * The acceptance criterion names the service/master/slot selection form, the
 * confirmation page and the cancel/reschedule actions: each must be fully
 * usable without horizontal scrolling. "Usable" is shown by completing the
 * flow on that viewport — every control is reached and clicked — and the page
 * is measured after each step.
 *
 *   M1  C1, every step, through to a booking
 *   M2  C3, through to a reschedule
 *   M3  C2's cancel action, through to the cancelled page
 *
 * The same pages are checked for REQ-NF-003 (English), REQ-NF-004 (UAH) and
 * REQ-NF-007 (no zone or location control) on the way.
 *
 * Source: REQ-NF-002, 003, 004, 007; spec/ui/screens.md §6; UI-GATE U-5.
 * Ticket: SMS-57 (Test) → SMS-36 (Feature)
 */

import { expect, test, type Page } from '@playwright/test';

import {
  createMaster,
  createService,
  linkService,
  signInAdmin,
  workEveryDay,
  type Staff,
} from './support/api.js';
import { expectInterfaceRules, expectNoHorizontalScroll } from './support/checks.js';
import { resetDatabase } from './support/db.js';
import { salonDate } from './support/time.js';

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

const DAY = salonDate(16);
const NEW_DAY = salonDate(17);

let anna: Staff;

test.beforeAll(async ({ request }) => {
  await resetDatabase();
  const admin = await signInAdmin(request);
  anna = await createMaster(request, admin, 'Anna Koval');
  const haircut = await createService(request, admin, 'Haircut', 45);
  const beard = await createService(request, admin, 'Beard trim', 30, 'Barbering');
  await linkService(request, admin, anna.id, haircut.id, 500);
  await linkService(request, admin, anna.id, beard.id, 300);
  await workEveryDay(request, anna);
});

async function measure(page: Page): Promise<void> {
  await expectNoHorizontalScroll(page);
  await expectInterfaceRules(page);
}

/** Books through C1 on the mobile viewport, measuring after every step. */
async function bookOnMobile(page: Page, time: string): Promise<void> {
  await page.goto('/');
  await measure(page);

  const services = page.getByRole('region', { name: 'Choose services' });
  await services.getByRole('checkbox', { name: /Haircut/ }).tap();
  await services.getByRole('checkbox', { name: /Beard trim/ }).tap();
  await measure(page);

  const when = page.getByRole('region', { name: 'Choose a date and time' });
  await when.getByLabel('Date').fill(DAY);
  await when.getByRole('button', { name: time, exact: true }).tap();
  await measure(page);

  await page
    .getByRole('region', { name: 'Choose a master' })
    .getByRole('radio', { name: /Anna Koval/ })
    .tap();
  await measure(page);

  const details = page.getByRole('region', { name: 'Your details' });
  await details.getByLabel('Name').fill('Iryna Kovalenko');
  await details.getByLabel('Phone').fill('+380671234567');
  await measure(page);
  await details.getByRole('button', { name: 'Book' }).tap();

  await expect(page.getByText('Your appointment is confirmed.')).toBeVisible();
  await measure(page);
}

test('M1 books through every step of C1 without horizontal scrolling', async ({ page }) => {
  await bookOnMobile(page, '10:00');
});

test('M2 reschedules through C3 without horizontal scrolling', async ({ page }) => {
  await bookOnMobile(page, '12:00');
  await page.getByRole('button', { name: 'Reschedule' }).tap();
  // Measure C3 once it is there: the tap starts a navigation, and measuring
  // while the old page unloads destroys the evaluation context (test
  // correction, stage S6).
  await expect(page.getByLabel('New date')).toBeVisible();
  await measure(page);

  await page.getByLabel('New date').fill(NEW_DAY);
  await page.getByRole('button', { name: '13:00', exact: true }).tap();
  await measure(page);
  await page.getByRole('button', { name: 'Confirm new time' }).tap();

  await expect(page.getByText('Your appointment has been rescheduled.')).toBeVisible();
  await measure(page);
});

test('M3 cancels from C2 without horizontal scrolling', async ({ page }) => {
  await bookOnMobile(page, '15:00');
  await page.getByRole('button', { name: 'Cancel appointment' }).tap();
  await measure(page);
  await page.getByRole('button', { name: 'Yes, cancel' }).tap();

  await expect(page.getByText('Your appointment is cancelled.')).toBeVisible();
  await measure(page);
});
