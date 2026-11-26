/**
 * The interface's entry: picks the screen for the current path and renders it
 * into `#app`.
 *
 * Every page is a full page load of the same shell (`index.html`); a screen
 * that moves on (Book → C2, Sign in → M1/A1) navigates with `location`, so
 * the address bar is always the path of `spec/ui/screens.md` §3 and a reload
 * reopens the same screen.
 *
 * Source: spec/ui/screens.md §3.
 */

import { ProblemError, problemText, takeFlash } from './api.js';
import { notice, replace } from './dom.js';
import { renderBooking } from './screens/booking.js';
import { renderConfirmation } from './screens/confirmation.js';
import { renderReschedule } from './screens/reschedule.js';
import { renderSignIn } from './screens/sign-in.js';
import { renderStaffPage, staffHome } from './staff.js';

/** What a screen receives: its root element, the path's parameters, and a pending banner. */
export interface ScreenContext {
  readonly root: HTMLElement;
  readonly params: readonly string[];
  readonly flash: string | null;
}

type Screen = (context: ScreenContext) => Promise<void>;

const ROUTES: ReadonlyArray<readonly [RegExp, Screen]> = [
  [/^\/$/, (context) => renderBooking(context, 'client')],
  [/^\/appointments\/([^/]+)$/, renderConfirmation],
  [/^\/appointments\/([^/]+)\/reschedule$/, renderReschedule],
  [/^\/staff\/login$/, renderSignIn],
  [/^\/staff\/?$/, () => staffHome()],
  [/^\/staff\/(.+)$/, renderStaffPage],
];

async function start(): Promise<void> {
  const root = document.getElementById('app');
  if (root === null) return;
  const path = location.pathname;
  const flash = takeFlash();

  for (const [pattern, screen] of ROUTES) {
    const match = pattern.exec(path);
    if (match === null) continue;
    try {
      await screen({ root, params: match.slice(1), flash });
    } catch (error) {
      if (error instanceof ProblemError) {
        replace(root, notice(problemText(error.problem), 'error'));
      } else if (!(error instanceof Error && error.message === 'session ended')) {
        replace(root, notice('Something went wrong. Please reload the page.', 'error'));
      }
    }
    return;
  }
  replace(root, notice('This page does not exist.', 'error'));
}

void start();
