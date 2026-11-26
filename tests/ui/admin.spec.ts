/**
 * The administrator's screens (`/staff/admin/...`).
 *
 *   D1  A1 lists appointments and filters them by master
 *   D2  A2 creates an appointment through the C1 steps → A3
 *   D3  A3 shows reminders; payment only after completion (REQ-F-021, 027)
 *   D4  A3 Change moves the appointment (REQ-F-019, 028)
 *   D5  A3 Cancel appointment asks first, then cancels
 *   D6  A4 adds a master, refuses a taken username, deactivates
 *   D7  A5 offers the seed categories and saves a new one (REQ-F-024)
 *   D8  A6 adds a price for a master and a service
 *   D9  A7 offers the standard units and saves a custom one (REQ-F-025)
 *   D10 A8 records a receipt, refuses an issue beyond the stock (REQ-F-020)
 *   D11 A9 revenue for a preset and a custom range, popular services, stock
 *
 * Source: REQ-F-018…022, 024, 025, 027, 028, 032, 033; REQ-NF-004;
 *         spec/ui/screens.md §5.3.
 * Ticket: SMS-57 (Test) → SMS-36 (Feature)
 */

import { expect, test, type Page } from '@playwright/test';

import {
  book,
  complete,
  createMaster,
  createMaterial,
  createService,
  getJson,
  linkService,
  signInAdmin,
  workEveryDay,
  type Booked,
  type ServiceFixture,
  type Staff,
} from './support/api.js';
import { expectInterfaceRules } from './support/checks.js';
import { ADMIN, resetDatabase } from './support/db.js';
import { openFromMenu, row, save, signInUi } from './support/staff.js';
import { salonDate, salonInstant } from './support/time.js';

const DAY = salonDate(20);
const OTHER_DAY = salonDate(21);
const TODAY = salonDate(0);

let adminToken: string;
let anna: Staff;
let ivan: Staff;
let haircut: ServiceFixture;
let unlinked: ServiceFixture;
let forPayment: Booked;
let forChange: Booked;
let forCancel: Booked;

test.beforeAll(async ({ request }) => {
  await resetDatabase();
  adminToken = await signInAdmin(request);
  anna = await createMaster(request, adminToken, 'Anna Koval');
  ivan = await createMaster(request, adminToken, 'Ivan Bondar');
  haircut = await createService(request, adminToken, 'Haircut', 45);
  unlinked = await createService(request, adminToken, 'Beard trim', 30, 'Barbering');
  await linkService(request, adminToken, anna.id, haircut.id, 500);
  await linkService(request, adminToken, ivan.id, haircut.id, 450);
  await workEveryDay(request, anna);
  await workEveryDay(request, ivan);

  forPayment = await book(request, {
    masterId: anna.id,
    serviceIds: [haircut.id],
    startAt: salonInstant(DAY, '10:00'),
    name: 'Olena Shevchenko',
  });
  forChange = await book(request, {
    masterId: ivan.id,
    serviceIds: [haircut.id],
    startAt: salonInstant(DAY, '11:00'),
    name: 'Petro Hnatiuk',
  });
  forCancel = await book(request, {
    masterId: anna.id,
    serviceIds: [haircut.id],
    startAt: salonInstant(DAY, '14:00'),
    name: 'Maria Lysenko',
  });

  // D11: one paid payment recorded today, so the Day preset has revenue.
  const paid = await book(request, {
    masterId: ivan.id,
    serviceIds: [haircut.id],
    startAt: salonInstant(OTHER_DAY, '09:00'),
    name: 'Taras Melnyk',
  });
  await complete(request, adminToken, paid.id);
  const payment = await request.post(`/api/v1/admin/appointments/${paid.id}/payments`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { amount: { amountMinor: 45000, currency: 'UAH' }, method: 'card', status: 'paid' },
  });
  expect(payment.status()).toBe(201);

  await createMaterial(request, adminToken, 'Hair dye', 'ml', 10);
});

test.beforeEach(async ({ page }) => {
  await signInUi(page, ADMIN.username, ADMIN.password);
});

async function listDay(page: Page, date: string): Promise<void> {
  await page.getByLabel('From').fill(date);
  await page.getByLabel('To').fill(date);
}

async function openAppointment(page: Page, booked: Booked): Promise<void> {
  await page.goto(`/staff/admin/appointments/${booked.id}`);
}

test('D1 Appointments lists and filters by master', async ({ page }) => {
  await listDay(page, DAY);
  await expect(row(page, 'Olena Shevchenko', 'Anna Koval')).toHaveCount(1);
  await expect(row(page, 'Petro Hnatiuk', 'Ivan Bondar')).toHaveCount(1);

  await page.getByLabel('Master').selectOption({ label: 'Ivan Bondar' });
  await expect(row(page, 'Petro Hnatiuk')).toHaveCount(1);
  await expect(row(page, 'Olena Shevchenko')).toHaveCount(0);

  await row(page, 'Petro Hnatiuk').click();
  await expect(page).toHaveURL(new RegExp(`/staff/admin/appointments/${forChange.id}$`));
  await expectInterfaceRules(page);
});

test('D2 New appointment creates one through the C1 steps', async ({ page, request }) => {
  await page.getByRole('button', { name: 'New appointment' }).click();
  await expect(page).toHaveURL(/\/staff\/admin\/appointments\/new$/);

  await page
    .getByRole('region', { name: 'Choose services' })
    .getByRole('checkbox', { name: /Haircut/ })
    .check();
  const when = page.getByRole('region', { name: 'Choose a date and time' });
  await when.getByLabel('Date').fill(DAY);
  await when.getByRole('button', { name: '16:00', exact: true }).click();
  await page
    .getByRole('region', { name: 'Choose a master' })
    .getByRole('radio', { name: /Anna Koval/ })
    .check();
  const details = page.getByRole('region', { name: /details/ });
  await details.getByLabel('Name').fill('Sofia Kravets');
  await details.getByLabel('Phone').fill('+380503334455');
  await details.getByRole('button', { name: 'Create appointment' }).click();

  await expect(page).toHaveURL(/\/staff\/admin\/appointments\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Sofia Kravets')).toBeVisible();
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();

  const id = new URL(page.url()).pathname.split('/').pop() ?? '';
  const stored = await getJson<{ client: { name: string }; master: { id: string } }>(
    request,
    `/api/v1/admin/appointments/${id}`,
    adminToken,
  );
  expect(stored.client.name).toBe('Sofia Kravets');
  expect(stored.master.id).toBe(anna.id);
});

test('D3 records a payment only after completion', async ({ page }) => {
  await openAppointment(page, forPayment);

  const reminders = page.getByRole('region', { name: 'Reminders' });
  await expect(reminders).toContainText('24h');
  await expect(reminders).toContainText('2h');

  const record = page.getByRole('button', { name: 'Record payment' });
  await expect(record).toBeDisabled();

  await page.getByRole('button', { name: 'Mark as completed' }).click();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
  await expect(record).toBeEnabled();

  await record.click();
  await page.getByLabel('Amount').fill('500');
  await page.getByLabel('Method').selectOption({ label: 'Cash' });
  await page.getByLabel('Status').selectOption({ label: 'Paid' });
  await save(page);

  const payment = page.getByRole('region', { name: 'Payment' });
  await expect(payment).toContainText('500.00 UAH');
  await expect(payment).toContainText('Cash');
  await expect(payment).toContainText('Paid');
  await expect(page.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
  await expectInterfaceRules(page);
});

test('D4 Change moves the appointment to a new time', async ({ page, request }) => {
  await openAppointment(page, forChange);
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Date').fill(OTHER_DAY);
  await page.getByRole('button', { name: '15:00', exact: true }).click();
  await save(page);

  await expect
    .poll(async () => {
      const stored = await getJson<{ startAt: string }>(
        request,
        `/api/v1/admin/appointments/${forChange.id}`,
        adminToken,
      );
      return stored.startAt;
    })
    .toBe(salonInstant(OTHER_DAY, '15:00'));
});

test('D5 Cancel appointment asks first, then cancels', async ({ page }) => {
  await openAppointment(page, forCancel);
  await page.getByRole('button', { name: 'Cancel appointment' }).click();
  await page.getByRole('button', { name: 'Yes, cancel' }).click();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
});

test('D6 Masters adds one, refuses a taken username, deactivates', async ({ page }) => {
  await openFromMenu(page, 'Masters');

  await page.getByRole('button', { name: 'Add master' }).click();
  await page.getByLabel('Full name').fill('Oksana Tkachenko');
  await page.getByLabel('Username').fill('oksana');
  await page.getByLabel('Password').fill('oksana-password');
  await save(page);
  await expect(row(page, 'Oksana Tkachenko', 'oksana', 'Yes')).toHaveCount(1);

  await page.getByRole('button', { name: 'Add master' }).click();
  await page.getByLabel('Full name').fill('Another Oksana');
  await page.getByLabel('Username').fill('oksana');
  await page.getByLabel('Password').fill('another-password');
  await save(page);
  await expect(page.getByText('This username is already taken.')).toBeVisible();

  await page.reload();
  await row(page, 'Oksana Tkachenko').getByRole('button', { name: 'Deactivate' }).click();
  await expect(row(page, 'Oksana Tkachenko', 'No')).toHaveCount(1);
  await expect(
    row(page, 'Oksana Tkachenko').getByRole('button', { name: 'Activate' }),
  ).toBeVisible();
});

test('D7 Services offers the seed categories and saves a new one', async ({ page }) => {
  await openFromMenu(page, 'Services');
  await page.getByRole('button', { name: 'Add service' }).click();

  const category = page.getByLabel('Category');
  const offered = await category.evaluate((input) =>
    Array.from((input as HTMLInputElement).list?.options ?? []).map((option) => option.value),
  );
  expect(offered).toEqual(expect.arrayContaining(['Hair', 'Coloring', 'Barbering']));

  await page.getByLabel('Name').fill('Scalp massage');
  await category.fill('Spa');
  await page.getByLabel('Duration').fill('30');
  await save(page);

  await expect(row(page, 'Scalp massage', 'Spa', '30 min')).toHaveCount(1);
});

test('D8 Prices adds a price for a master and a service', async ({ page }) => {
  await openFromMenu(page, 'Prices');
  await page.getByRole('button', { name: 'Add price' }).click();
  await page.getByLabel('Master').selectOption({ label: 'Ivan Bondar' });
  await page.getByLabel('Service').selectOption({ label: unlinked.name });
  await page.getByLabel('Price').fill('650');
  await save(page);

  await expect(row(page, 'Ivan Bondar', unlinked.name, '650.00 UAH')).toHaveCount(1);
  await expectInterfaceRules(page);
});

test('D9 Materials offers the standard units and saves a custom one', async ({ page }) => {
  await openFromMenu(page, 'Materials');
  await page.getByRole('button', { name: 'Add material' }).click();

  const unit = page.getByLabel('Unit');
  const offered = await unit.evaluate((input) =>
    Array.from((input as HTMLInputElement).list?.options ?? []).map((option) => option.value),
  );
  expect(offered).toEqual(expect.arrayContaining(['ml', 'l', 'g', 'kg', 'pcs']));

  await page.getByLabel('Name').fill('Argan oil');
  await unit.fill('drops');
  await page.getByLabel('Initial stock').fill('40');
  await save(page);

  await expect(row(page, 'Argan oil', 'drops', '40')).toHaveCount(1);
});

test('D10 a material records a receipt and refuses an issue beyond the stock', async ({ page }) => {
  await openFromMenu(page, 'Materials');
  await row(page, 'Hair dye').getByRole('link').first().click();
  await expect(page).toHaveURL(/\/staff\/admin\/materials\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: 'Add transaction' }).click();
  await page.getByLabel('Type').selectOption({ label: 'Receipt' });
  await page.getByLabel('Quantity').fill('5');
  await page.getByLabel('Date').fill(TODAY);
  await save(page);
  await expect(row(page, 'Receipt', '5')).toHaveCount(1);
  await expect(page.getByText('In stock: 15 ml')).toBeVisible();

  await page.getByRole('button', { name: 'Add transaction' }).click();
  await page.getByLabel('Type').selectOption({ label: 'Issue' });
  await page.getByLabel('Quantity').fill('100');
  await page.getByLabel('Date').fill(TODAY);
  await save(page);
  await expect(page.getByText('Not enough stock for this issue.')).toBeVisible();
});

test('D11 Reports: revenue, popular services, stock levels', async ({ page, request }) => {
  // The interface renders the server's report: the expectation is R28's own
  // answer for the same window, so a payment recorded by D3 cannot skew it.
  const day = await getJson<{ totalAmount: { amountMinor: number }; paymentsCount: number }>(
    request,
    '/api/v1/admin/reports/revenue?period=day',
    adminToken,
  );
  expect(day.paymentsCount).toBeGreaterThanOrEqual(1);
  const total = `Total: ${(day.totalAmount.amountMinor / 100).toFixed(2)} UAH`;

  await openFromMenu(page, 'Reports');

  await page.getByRole('tab', { name: 'Revenue' }).click();
  await page.getByLabel('Period').selectOption({ label: 'Day' });
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(page.getByText(total)).toBeVisible();
  await expect(page.getByText(`Payments: ${day.paymentsCount}`)).toBeVisible();

  await page.getByLabel('Period').selectOption({ label: 'Custom range' });
  await page.getByLabel('From').fill(TODAY);
  await page.getByLabel('To').fill(TODAY);
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(page.getByText(total)).toBeVisible();

  await page.getByRole('tab', { name: 'Popular services' }).click();
  await page.getByLabel('Period').selectOption({ label: 'Custom range' });
  await page.getByLabel('From').fill(DAY);
  await page.getByLabel('To').fill(OTHER_DAY);
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(row(page, '1', 'Haircut')).toHaveCount(1);

  await page.getByRole('tab', { name: 'Stock levels' }).click();
  await expect(row(page, 'Hair dye', 'ml')).toHaveCount(1);
  await expectInterfaceRules(page);
});
