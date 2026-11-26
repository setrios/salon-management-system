/**
 * S1 Sign in, the staff header and the session (`/staff/login`, `/staff/`).
 *
 *   S1  wrong credentials → the message; no sign-up or reset link
 *   S2  a master lands on My calendar, with the master's menu only
 *   S3  the administrator lands on Appointments, with the administrator's menu
 *   S4  Sign out forgets the session; a staff page then asks to sign in
 *   S5  a 401 from any call ends the session with the message
 *   S6  /staff/ sends each role to its first screen
 *
 * Source: REQ-F-012, REQ-F-017; spec/ui/screens.md §3, §5.1; UI-GATE U-3.
 * Ticket: SMS-57 (Test) → SMS-36 (Feature)
 */

import { expect, test } from '@playwright/test';

import { createMaster, signInAdmin, type Staff } from './support/api.js';
import { expectInterfaceRules } from './support/checks.js';
import { ADMIN, resetDatabase } from './support/db.js';
import { menu, openFromMenu, signInUi } from './support/staff.js';

const MASTER_MENU = [
  'My calendar',
  'My services',
  'My availability',
  'Notifications',
  'Notification settings',
];
const ADMIN_MENU = [
  'Appointments',
  'Masters',
  'Services',
  'Prices',
  'Materials',
  'Reports',
  'Notifications',
  'Notification settings',
];

let anna: Staff;

test.beforeAll(async ({ request }) => {
  await resetDatabase();
  anna = await createMaster(request, await signInAdmin(request), 'Anna Koval');
});

test('S1 refuses wrong credentials and offers no sign-up or reset', async ({ page }) => {
  await page.goto('/staff/login');
  await page.getByLabel('Username').fill(anna.username);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Wrong username or password.')).toBeVisible();
  await expect(page).toHaveURL(/\/staff\/login$/);
  await expect(page.getByRole('link', { name: /sign up|register|forgot|reset/i })).toHaveCount(0);
  await expectInterfaceRules(page);
});

test("S2 signs a master in to My calendar with the master's menu", async ({ page }) => {
  await signInUi(page, anna.username, anna.password);

  await expect(page).toHaveURL(/\/staff\/me\/calendar$/);
  await expect(page.getByText('Anna Koval')).toBeVisible();
  for (const name of MASTER_MENU) {
    await expect(menu(page).getByRole('link', { name, exact: true })).toBeVisible();
  }
  for (const name of ['Appointments', 'Masters', 'Reports']) {
    await expect(menu(page).getByRole('link', { name, exact: true })).toHaveCount(0);
  }
});

test("S3 signs the administrator in to Appointments with the administrator's menu", async ({
  page,
}) => {
  await signInUi(page, ADMIN.username, ADMIN.password);

  await expect(page).toHaveURL(/\/staff\/admin\/appointments$/);
  await expect(page.getByText(ADMIN.fullName)).toBeVisible();
  for (const name of ADMIN_MENU) {
    await expect(menu(page).getByRole('link', { name, exact: true })).toBeVisible();
  }
});

test('S4 Sign out forgets the session', async ({ page }) => {
  await signInUi(page, anna.username, anna.password);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/staff\/login$/);

  await page.goto('/staff/me/calendar');
  await expect(page).toHaveURL(/\/staff\/login$/);
});

test('S5 a 401 ends the session with the message', async ({ page }) => {
  await signInUi(page, anna.username, anna.password);
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: 'https://api.salon.example/problems/unauthenticated',
        title: 'Unauthenticated',
        status: 401,
        code: 'UNAUTHENTICATED',
      }),
    }),
  );

  await openFromMenu(page, 'My services');

  await expect(page).toHaveURL(/\/staff\/login$/);
  await expect(page.getByText('Your session has ended. Please sign in again.')).toBeVisible();
});

test('S6 /staff/ sends each role to its first screen', async ({ page }) => {
  await signInUi(page, anna.username, anna.password);
  await page.goto('/staff/');
  await expect(page).toHaveURL(/\/staff\/me\/calendar$/);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signInUi(page, ADMIN.username, ADMIN.password);
  await page.goto('/staff/');
  await expect(page).toHaveURL(/\/staff\/admin\/appointments$/);
});
