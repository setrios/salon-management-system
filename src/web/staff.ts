/**
 * The staff shell: sign-in guard, header, role menu, and the page table of
 * `spec/ui/screens.md` §3 for `/staff/...`.
 *
 * Without a token every staff page opens S1. With one, A2 says who is signed
 * in; a page of the other role sends to the role's first screen (master → M1,
 * administrator → A1). The header shows the person's `displayName`, the role's
 * menu (§5.2 / §5.3) and **Sign out**, which only forgets the token — the
 * contract has no logout operation.
 *
 * Source: REQ-F-012, REQ-F-017; spec/ui/screens.md §5.1–§5.3; UI-GATE U-3.
 */

import { forgetStaffToken, read, staffToken } from './api.js';
import { h, notice, replace } from './dom.js';
import type { ScreenContext } from './main.js';
import {
  renderAppointmentDetails,
  renderAppointmentList,
  renderNewAppointment,
} from './screens/admin.js';
import { renderMasters, renderPrices, renderServicesAdmin } from './screens/admin-catalogue.js';
import { renderMaterial, renderMaterials } from './screens/admin-materials.js';
import { renderReports } from './screens/admin-reports.js';
import { renderAvailability, renderCalendar, renderMyServices } from './screens/master.js';
import { renderNotificationSettings, renderNotifications } from './screens/notifications.js';

/** The contract's `Principal`. */
export interface Principal {
  readonly id: string;
  readonly role: 'master' | 'admin';
  readonly displayName: string;
}

/** What a staff screen receives. */
export interface StaffContext {
  /** The page's main area, under the header. */
  readonly root: HTMLElement;
  readonly principal: Principal;
  /** The path's parameters (an appointment or material id). */
  readonly params: readonly string[];
  readonly flash: string | null;
}

type StaffScreen = (context: StaffContext) => Promise<void>;

interface StaffPage {
  readonly pattern: RegExp;
  readonly role: Principal['role'] | 'any';
  readonly title: string;
  readonly render: StaffScreen;
}

const PAGES: readonly StaffPage[] = [
  { pattern: /^me\/calendar$/, role: 'master', title: 'My calendar', render: renderCalendar },
  { pattern: /^me\/services$/, role: 'master', title: 'My services', render: renderMyServices },
  {
    pattern: /^me\/availability$/,
    role: 'master',
    title: 'My availability',
    render: renderAvailability,
  },
  { pattern: /^notifications$/, role: 'any', title: 'Notifications', render: renderNotifications },
  {
    pattern: /^notification-settings$/,
    role: 'any',
    title: 'Notification settings',
    render: renderNotificationSettings,
  },
  {
    pattern: /^admin\/appointments$/,
    role: 'admin',
    title: 'Appointments',
    render: renderAppointmentList,
  },
  {
    pattern: /^admin\/appointments\/new$/,
    role: 'admin',
    title: 'New appointment',
    render: renderNewAppointment,
  },
  {
    pattern: /^admin\/appointments\/([^/]+)$/,
    role: 'admin',
    title: 'Appointment details',
    render: renderAppointmentDetails,
  },
  { pattern: /^admin\/masters$/, role: 'admin', title: 'Masters', render: renderMasters },
  { pattern: /^admin\/services$/, role: 'admin', title: 'Services', render: renderServicesAdmin },
  { pattern: /^admin\/master-services$/, role: 'admin', title: 'Prices', render: renderPrices },
  { pattern: /^admin\/materials$/, role: 'admin', title: 'Materials', render: renderMaterials },
  {
    pattern: /^admin\/materials\/([^/]+)$/,
    role: 'admin',
    title: 'Material',
    render: renderMaterial,
  },
  { pattern: /^admin\/reports$/, role: 'admin', title: 'Reports', render: renderReports },
];

const MENUS: Readonly<Record<Principal['role'], ReadonlyArray<readonly [string, string]>>> = {
  master: [
    ['My calendar', '/staff/me/calendar'],
    ['My services', '/staff/me/services'],
    ['My availability', '/staff/me/availability'],
    ['Notifications', '/staff/notifications'],
    ['Notification settings', '/staff/notification-settings'],
  ],
  admin: [
    ['Appointments', '/staff/admin/appointments'],
    ['Masters', '/staff/admin/masters'],
    ['Services', '/staff/admin/services'],
    ['Prices', '/staff/admin/master-services'],
    ['Materials', '/staff/admin/materials'],
    ['Reports', '/staff/admin/reports'],
    ['Notifications', '/staff/notifications'],
    ['Notification settings', '/staff/notification-settings'],
  ],
};

/** The first screen of a role (S1's destination). */
export function homeOf(role: Principal['role']): string {
  return role === 'master' ? '/staff/me/calendar' : '/staff/admin/appointments';
}

/** A2, or S1 when nobody is signed in. */
async function currentPrincipal(): Promise<Principal | null> {
  if (staffToken() === null) {
    location.assign('/staff/login');
    return null;
  }
  return read<Principal>('/auth/me', { staff: true });
}

/** `/staff/` — sends the signed-in person to their role's first screen. */
export async function staffHome(): Promise<void> {
  const principal = await currentPrincipal();
  if (principal !== null) location.replace(homeOf(principal.role));
}

function header(principal: Principal, current: string): HTMLElement {
  const links = MENUS[principal.role].map(([name, href]) =>
    h('li', {}, h('a', { href, 'aria-current': href === current ? 'page' : null }, name)),
  );
  return h(
    'header',
    { class: 'staff-header' },
    h('p', { class: 'staff-who' }, principal.displayName),
    h('nav', { 'aria-label': 'Main' }, h('ul', { class: 'menu' }, ...links)),
    h(
      'button',
      {
        type: 'button',
        class: 'link-button',
        onclick: () => {
          forgetStaffToken();
          location.assign('/staff/login');
        },
      },
      'Sign out',
    ),
  );
}

/** Renders a `/staff/...` page: guard, header, then the page's own screen. */
export async function renderStaffPage(context: ScreenContext): Promise<void> {
  const subpath = context.params[0] ?? '';
  const page = PAGES.find((candidate) => candidate.pattern.test(subpath));
  if (page === undefined) {
    replace(context.root, notice('This page does not exist.', 'error'));
    return;
  }

  const principal = await currentPrincipal();
  if (principal === null) return;
  if (page.role !== 'any' && page.role !== principal.role) {
    location.replace(homeOf(principal.role));
    return;
  }

  document.title = `${page.title} — Salon`;
  const main = h('main', { class: 'staff-main' });
  replace(context.root, header(principal, location.pathname), main);
  const params = page.pattern.exec(subpath)?.slice(1) ?? [];
  await page.render({ root: main, principal, params, flash: context.flash });
}
