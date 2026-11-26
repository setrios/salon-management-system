/**
 * Web — serves the interface's pages and assets (SMS-36).
 *
 * The interface is static: one HTML shell for every page path of
 * `spec/ui/screens.md` §3, and the compiled browser modules and stylesheet
 * under `/assets/`. The browser code renders the screen for the path and calls
 * the approved API under `/api/v1`; nothing here reads the database.
 *
 * Only the paths of §3 are pages (constraint 2.5): any other path still
 * reaches the API's terminal 404 `Problem`, so a typo never answers HTML.
 *
 * Source: SRS v1.3 §User Interface; REQ-F-004 (the confirmation page at the
 *         SMS link's path); spec/ui/screens.md §2, §3; UI-GATE U-1.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import express, { Router, type NextFunction, type Request, type Response } from 'express';

/**
 * The page paths of `screens.md` §3, in Express syntax. `/staff` and `/staff/`
 * are both listed: the shell redirects either to the role's first screen.
 */
export const PAGE_PATHS: readonly string[] = [
  '/',
  '/appointments/:token',
  '/appointments/:token/reschedule',
  '/staff',
  '/staff/',
  '/staff/login',
  '/staff/me/calendar',
  '/staff/me/services',
  '/staff/me/availability',
  '/staff/notifications',
  '/staff/notification-settings',
  '/staff/admin/appointments',
  '/staff/admin/appointments/new',
  '/staff/admin/appointments/:id',
  '/staff/admin/masters',
  '/staff/admin/services',
  '/staff/admin/master-services',
  '/staff/admin/materials',
  '/staff/admin/materials/:id',
  '/staff/admin/reports',
];

/**
 * Where the built interface lives: `dist/src/web`, next to this module's
 * compiled form (`dist/src/modules/web/routes.js` → `../../web`).
 */
function webRoot(): string {
  return fileURLToPath(new URL('../../web/', import.meta.url));
}

/**
 * Builds the router for the interface.
 *
 * A page answer is `no-store`: the shell is tiny, and a cached shell could
 * outlive the assets it names after a deployment.
 *
 * @param root - directory holding `index.html` and `assets/`; defaults to the build output.
 */
export function webRouter(root: string = webRoot()): Router {
  const router = Router();
  const shell = `${root}index.html`;

  router.use(
    '/assets',
    express.static(`${root}assets`, { fallthrough: true, index: false, maxAge: 0 }),
  );

  const sendShell = (_req: Request, res: Response, next: NextFunction): void => {
    if (!existsSync(shell)) {
      // A server started from a tree that was never built has no pages; the
      // request falls through to the terminal 404 `Problem`, the API's one
      // answer for "nothing here".
      next();
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.sendFile(shell);
  };

  for (const path of PAGE_PATHS) router.get(path, sendShell);

  return router;
}
