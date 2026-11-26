/**
 * N1 Notifications and N2 Notification settings — both roles.
 *
 * N1 lists the signed-in person's notification records (M7) with the filters
 * of the contract. N2 shows one switch per event × channel (M5); changing one
 * sends one M6 for that cell only, so no other setting moves (REQ-F-026).
 *
 * Source: REQ-F-016, 023, 026, 030; spec/ui/screens.md §5.1, §11 K5.
 */

import { call, read, readAll } from '../api.js';
import { field, h, notice, replace, select, table } from '../dom.js';
import {
  formatChannel,
  formatDelivery,
  formatEvent,
  formatInstant,
  formatStatus,
} from '../format.js';
import type { StaffContext } from '../staff.js';

interface Notification {
  readonly id: string;
  readonly appointmentId?: string;
  readonly eventType: string;
  readonly channel: string;
  readonly status: string;
  readonly createdAt: string;
}

interface Preference {
  readonly channel: 'sms' | 'in_app';
  readonly eventType: 'new' | 'reschedule' | 'cancellation';
  readonly enabled: boolean;
}

/** N1 — Notifications. */
export async function renderNotifications(context: StaffContext): Promise<void> {
  const status = select([
    { value: '', label: 'Any' },
    ...['scheduled', 'sent', 'skipped', 'failed', 'cancelled'].map((value) => ({
      value,
      label: formatStatus(value),
    })),
  ]);
  const event = select([
    { value: '', label: 'Any' },
    ...['new', 'reschedule', 'cancellation', 'reminder_24h', 'reminder_2h'].map((value) => ({
      value,
      label: formatEvent(value),
    })),
  ]);
  const from = h('input', { type: 'date' });
  const to = h('input', { type: 'date' });
  const list = h('div');
  let loadToken = 0;

  async function load(): Promise<void> {
    const query = new URLSearchParams();
    if (status.value !== '') query.set('status', status.value);
    if (event.value !== '') query.set('eventType', event.value);
    if (from.value !== '') query.set('from', from.value);
    if (to.value !== '') query.set('to', to.value);
    const token = ++loadToken;
    const items = await readAll<Notification>(`/me/notifications?${query.toString()}`, {
      staff: true,
    });
    if (token !== loadToken) return;
    replace(
      list,
      items.length === 0
        ? notice('No notifications.', 'info')
        : table(
            ['Created', 'Event', 'Channel', 'Status', 'Appointment'],
            items.map((item) => [
              formatInstant(item.createdAt),
              formatEvent(item.eventType),
              formatChannel(item.channel),
              formatDelivery(item.status),
              item.appointmentId === undefined
                ? '—'
                : context.principal.role === 'admin'
                  ? h('a', { href: `/staff/admin/appointments/${item.appointmentId}` }, 'Open')
                  : item.appointmentId.slice(0, 8),
            ]),
          ),
    );
  }
  for (const control of [status, event, from, to]) {
    control.addEventListener('change', () => void load());
  }

  replace(
    context.root,
    h('h1', {}, 'Notifications'),
    h(
      'div',
      { class: 'filters' },
      field('Status', status),
      field('Event', event),
      field('From', from),
      field('To', to),
    ),
    list,
  );
  await load();
}

const EVENTS: ReadonlyArray<Preference['eventType']> = ['new', 'reschedule', 'cancellation'];
const CHANNELS: ReadonlyArray<Preference['channel']> = ['sms', 'in_app'];

/** N2 — Notification settings. */
export async function renderNotificationSettings(context: StaffContext): Promise<void> {
  const preferences = await read<Preference[]>('/me/notification-preferences', { staff: true });
  const message = h('div', { class: 'messages' });
  const enabled = (eventType: string, channel: string): boolean =>
    preferences.find((item) => item.eventType === eventType && item.channel === channel)?.enabled ??
    true;

  const rows = EVENTS.map((eventType) => [
    formatEvent(eventType),
    ...CHANNELS.map((channel) => {
      const box = h('input', {
        type: 'checkbox',
        role: 'switch',
        'aria-label': `${formatEvent(eventType)} ${formatChannel(channel)}`,
        checked: enabled(eventType, channel),
      });
      box.addEventListener('change', () => {
        void (async (): Promise<void> => {
          const result = await call('PATCH', '/me/notification-preferences', {
            staff: true,
            body: { channel, eventType, enabled: box.checked },
          });
          if (result.ok) {
            replace(message, notice('Saved.', 'ok'));
          } else {
            box.checked = !box.checked;
            replace(message, notice(result.problem.detail ?? result.problem.title, 'error'));
          }
        })();
      });
      return box;
    }),
  ]);

  replace(
    context.root,
    h('h1', {}, 'Notification settings'),
    h('p', {}, 'Choose how you are told about your appointments.'),
    table(['Event', 'SMS', 'In-app'], rows),
    message,
  );
}
