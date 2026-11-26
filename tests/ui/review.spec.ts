/**
 * SMS-76 — the developer's hands-on review of the interface before G5.
 *
 * Three findings of the review (2026-11-26), each turned into a check:
 *
 *   V1  A9 Reports: **From** / **To** can be used at once — typing a date
 *       switches **Period** to *Custom range*, and choosing a preset clears the
 *       dates, so the two forms are still never sent together (REQ-F-022, K10).
 *       Before: both fields were disabled until *Custom range* was chosen, and
 *       a click on them did nothing visible.
 *   V2  M3 My availability: a row's **Remove** and the region's **Add** do not
 *       touch — at least 8 px apart.
 *   V3  M3 My availability: **Save** stands out from **Add** and **Remove**
 *       (another background), and is at least 8 px from them.
 *
 * Source: the developer's review before G5; REQ-F-022; REQ-NF-002 ("fully
 *         usable"); spec/ui/screens.md §5.2 (M3), §5.3 (A9), §11 K2, K10.
 * Ticket: SMS-76 (Test)
 */

import { expect, test, type Locator } from '@playwright/test';

import { createMaster, signInAdmin, workEveryDay, type Staff } from './support/api.js';
import { ADMIN, resetDatabase } from './support/db.js';
import { openFromMenu, signInUi } from './support/staff.js';
import { salonDate } from './support/time.js';

let anna: Staff;

test.beforeAll(async ({ request }) => {
  await resetDatabase();
  anna = await createMaster(request, await signInAdmin(request), 'Anna Koval');
  await workEveryDay(request, anna);
});

/** The smallest distance between two boxes, 0 when they overlap or touch. */
async function distance(a: Locator, b: Locator): Promise<number> {
  const first = await a.boundingBox();
  const second = await b.boundingBox();
  if (first === null || second === null) throw new Error('a control is not rendered');
  const gapX = Math.max(second.x - (first.x + first.width), first.x - (second.x + second.width), 0);
  const gapY = Math.max(
    second.y - (first.y + first.height),
    first.y - (second.y + second.height),
    0,
  );
  return Math.max(gapX, gapY);
}

async function background(control: Locator): Promise<string> {
  return control.evaluate((element) => getComputedStyle(element).backgroundColor);
}

test('V1 Reports: a date can be typed at once and switches to Custom range', async ({ page }) => {
  await signInUi(page, ADMIN.username, ADMIN.password);
  await openFromMenu(page, 'Reports');

  const period = page.getByLabel('Period');
  const from = page.getByLabel('From');
  const to = page.getByLabel('To');
  await expect(from).toBeEnabled();
  await expect(to).toBeEnabled();

  await from.fill(salonDate(-7));
  await to.fill(salonDate(0));
  await expect(period.locator('option:checked')).toHaveText('Custom range');

  await period.selectOption({ label: 'Week' });
  await expect(from).toHaveValue('');
  await expect(to).toHaveValue('');
});

test('V2 My availability: Remove and Add do not touch', async ({ page }) => {
  await signInUi(page, anna.username, anna.password);
  await openFromMenu(page, 'My availability');

  const weekly = page.getByRole('region', { name: 'Weekly hours' });
  const lastRemove = weekly.getByRole('button', { name: 'Remove' }).last();
  const add = weekly.getByRole('button', { name: 'Add' });
  expect(await distance(lastRemove, add)).toBeGreaterThanOrEqual(8);

  const removes = await weekly.getByRole('button', { name: 'Remove' }).all();
  for (let index = 1; index < removes.length; index += 1) {
    const previous = removes[index - 1];
    const current = removes[index];
    if (previous === undefined || current === undefined) continue;
    expect(await distance(previous, current)).toBeGreaterThanOrEqual(8);
  }
});

test('V3 My availability: Save stands out from Add and Remove', async ({ page }) => {
  await signInUi(page, anna.username, anna.password);
  await openFromMenu(page, 'My availability');

  const save = page.getByRole('button', { name: 'Save', exact: true });
  const add = page.getByRole('region', { name: 'Specific dates' }).getByRole('button', {
    name: 'Add',
  });
  const remove = page
    .getByRole('region', { name: 'Weekly hours' })
    .getByRole('button', { name: 'Remove' })
    .first();

  const saveBackground = await background(save);
  expect(saveBackground).not.toBe(await background(add));
  expect(saveBackground).not.toBe(await background(remove));
  expect(await distance(add, save)).toBeGreaterThanOrEqual(8);
});
