/**
 * Staff-side helpers for the browser tests: signing in through S1 and the
 * conventions every staff form follows (TEST-GATE SMS-57, table K).
 */

import { expect, type Locator, type Page } from '@playwright/test';

/** Signs in through S1 and waits for the role's first screen. */
export async function signInUi(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/staff/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/staff\/login/);
}

/** The menu of the staff header. */
export function menu(page: Page): Locator {
  return page.getByRole('navigation');
}

/** Opens a screen through the menu. */
export async function openFromMenu(page: Page, name: string): Promise<void> {
  await menu(page).getByRole('link', { name, exact: true }).click();
}

/** A table row containing every given text. */
export function row(page: Page | Locator, ...texts: string[]): Locator {
  let locator = page.getByRole('row');
  for (const text of texts) locator = locator.filter({ hasText: text });
  return locator;
}

/** Submits the open form (K2: every staff form is submitted with "Save"). */
export async function save(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

/** A notification-settings switch for one event and one channel (K5). */
export function preferenceSwitch(page: Page, event: string, channel: string): Locator {
  const name = new RegExp(`^${event}\\W+${channel}$`);
  return page.getByRole('checkbox', { name }).or(page.getByRole('switch', { name }));
}
