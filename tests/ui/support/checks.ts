/**
 * Checks of the cross-cutting interface requirements (`spec/ui/screens.md` §6),
 * applied to whatever page a test is on.
 */

import { expect, type Page } from '@playwright/test';

/**
 * REQ-NF-002: the page is laid out for the device's width and does not scroll
 * horizontally. The first half matters as much as the second: a page without a
 * device-width viewport is laid out at 980 px and shrunk, which never scrolls
 * but is not usable on a phone either.
 */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('the test has no viewport');
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(clientWidth, 'layout width equals the device width').toBe(viewport.width);
  expect(
    scrollWidth,
    `scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
  ).toBeLessThanOrEqual(clientWidth);
}

/** Any Cyrillic letter (U+0400–U+04FF). */
const CYRILLIC = new RegExp('[\\u0400-\\u04FF]');

/** REQ-NF-003: no rendered text is in another script (the fixtures are Latin). */
export async function expectEnglishOnly(page: Page): Promise<void> {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(CYRILLIC);
}

/**
 * REQ-NF-004: every amount is rendered as `<n>.<nn> UAH` (U-4), so a two-decimal
 * number not followed by ` UAH`, or another currency mark, is a failure.
 */
export async function expectMoneyInUah(page: Page): Promise<void> {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\d+\.\d{2}(?! UAH)/);
  expect(text).not.toMatch(/₴|грн|UAH\s*\d/);
}

/** REQ-NF-007: no control to choose a time zone or a location. */
export async function expectNoZoneOrLocationControl(page: Page): Promise<void> {
  await expect(page.getByLabel(/time ?zone|location/i)).toHaveCount(0);
  await expect(page.locator('option', { hasText: /Europe\/|GMT[+-]|UTC[+-]/ })).toHaveCount(0);
}

/** The three text checks together, for any screen. */
export async function expectInterfaceRules(page: Page): Promise<void> {
  await expectEnglishOnly(page);
  await expectMoneyInUah(page);
  await expectNoZoneOrLocationControl(page);
}
