/**
 * The master's screens: M1 My calendar, M2 My services, M3 My availability.
 *
 * M1 lists only the signed-in master's appointments, with the client's name
 * and phone (REQ-F-013; REQ-NF-006 allows exactly this). M2 is read-only:
 * prices are the administrator's (REQ-F-018). M3 edits the whole rule set and
 * saves it with one M4, which replaces it (resource-model §4).
 *
 * Source: REQ-F-013, 014, 015; REQ-NF-004, 006; spec/ui/screens.md §5.2,
 *         §11 K1, K4.
 */

import { call, read, readAll } from '../api.js';
import {
  clearInvalid,
  field,
  h,
  markInvalid,
  notice,
  region,
  replace,
  select,
  table,
  TIME_24H,
  timeInput,
} from '../dom.js';
import {
  addDays,
  formatDate,
  formatMinutes,
  formatMoney,
  formatStatus,
  formatTime,
  mondayOf,
  salonToday,
  type Money,
} from '../format.js';
import type { Service } from '../offers.js';
import type { StaffContext } from '../staff.js';

/** An appointment as the staff operations return it (`AppointmentAdmin`). */
export interface StaffAppointment {
  readonly id: string;
  readonly status: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly client: { readonly name: string; readonly phone: string };
  readonly master: { readonly id: string; readonly fullName: string };
  readonly services: ReadonlyArray<{
    readonly serviceId: string;
    readonly name: string;
    readonly price: Money;
  }>;
  readonly totalDurationMinutes: number;
  readonly totalPrice: Money;
}

/** M1 — My calendar. */
export async function renderCalendar(context: StaffContext): Promise<void> {
  const today = salonToday();
  const from = h('input', { type: 'date', name: 'from', value: mondayOf(today) });
  const to = h('input', { type: 'date', name: 'to', value: addDays(mondayOf(today), 6) });
  const list = h('div', { class: 'calendar' });
  let loadToken = 0;

  async function load(): Promise<void> {
    if (from.value === '' || to.value === '') return;
    const token = ++loadToken;
    const items = await readAll<StaffAppointment>(
      `/me/appointments?from=${from.value}&to=${to.value}`,
      { staff: true },
    );
    if (token !== loadToken) return; // a newer period was asked for meanwhile
    const days = [...new Set(items.map((item) => item.startAt.slice(0, 10)))].sort();
    replace(
      list,
      items.length === 0 ? notice('No appointments in this period.', 'info') : null,
      ...days.map((day) =>
        h(
          'section',
          { class: 'day' },
          h('h2', {}, formatDate(day)),
          h(
            'ul',
            { class: 'plain' },
            ...items
              .filter((item) => item.startAt.startsWith(day))
              .sort((a, b) => a.startAt.localeCompare(b.startAt))
              .map((item) =>
                h(
                  'li',
                  { class: 'entry' },
                  h('strong', {}, `${formatTime(item.startAt)}–${formatTime(item.endAt)}`),
                  h('span', { class: 'block' }, item.client.name),
                  h('span', { class: 'block' }, item.client.phone),
                  h(
                    'span',
                    { class: 'block' },
                    item.services.map((service) => service.name).join(', '),
                  ),
                  h('span', { class: 'block' }, formatStatus(item.status)),
                ),
              ),
          ),
        ),
      ),
    );
  }
  from.addEventListener('change', () => void load());
  to.addEventListener('change', () => void load());

  replace(
    context.root,
    h('h1', {}, 'My calendar'),
    h('div', { class: 'filters' }, field('From', from), field('To', to)),
    list,
  );
  await load();
}

interface MasterServiceLink {
  readonly serviceId: string;
  readonly price: Money;
  readonly active: boolean;
}

/** M2 — My services (names from the public catalogue, P1). */
export async function renderMyServices(context: StaffContext): Promise<void> {
  const [links, services] = await Promise.all([
    read<MasterServiceLink[]>('/me/services', { staff: true }),
    readAll<Service>('/services'),
  ]);
  const byId = new Map(services.map((service) => [service.id, service]));
  replace(
    context.root,
    h('h1', {}, 'My services'),
    links.length === 0
      ? notice('No services are linked to you yet.', 'info')
      : table(
          ['Service', 'Category', 'Duration', 'Price'],
          links.map((link) => {
            const service = byId.get(link.serviceId);
            return [
              service?.name ?? '—',
              service?.category ?? '—',
              service === undefined ? '—' : formatMinutes(service.baseDurationMinutes),
              formatMoney(link.price),
            ];
          }),
        ),
  );
}

interface WeeklyRule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface DateRule {
  date: string;
  startTime: string;
  endTime: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** M3 — My availability: weekly hours and specific dates, saved together with M4. */
export async function renderAvailability(context: StaffContext): Promise<void> {
  const stored = await read<{ weekly: WeeklyRule[]; dates: DateRule[] }>('/me/availability', {
    staff: true,
  });
  const weeklyRows = h('div', { class: 'rows' });
  const dateRows = h('div', { class: 'rows' });
  const message = h('div', { class: 'messages' });

  function removable(row: HTMLElement): HTMLElement {
    row.append(
      h('button', { type: 'button', class: 'secondary', onclick: () => row.remove() }, 'Remove'),
    );
    return row;
  }

  function weeklyRow(rule?: WeeklyRule): HTMLElement {
    const day = select(
      DAYS.map((label, index) => ({ value: String(index + 1), label })),
      { 'data-part': 'day' },
    );
    if (rule !== undefined) day.value = String(rule.dayOfWeek);
    const start = timeInput(rule?.startTime ?? '', { 'data-part': 'start' });
    const end = timeInput(rule?.endTime ?? '', { 'data-part': 'end' });
    return removable(
      h('div', { class: 'row' }, field('Day', day), field('From', start), field('To', end)),
    );
  }

  function dateRow(rule?: DateRule): HTMLElement {
    const date = h('input', { type: 'date', 'data-part': 'date', value: rule?.date ?? '' });
    const start = timeInput(rule?.startTime ?? '', { 'data-part': 'start' });
    const end = timeInput(rule?.endTime ?? '', { 'data-part': 'end' });
    return removable(
      h('div', { class: 'row' }, field('Date', date), field('From', start), field('To', end)),
    );
  }

  for (const rule of stored.weekly) weeklyRows.append(weeklyRow(rule));
  for (const rule of stored.dates) dateRows.append(dateRow(rule));

  const part = (row: Element, name: string): string =>
    row.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-part="${name}"]`)?.value ?? '';

  /**
   * Marks (K7) a row with a missing time, or whose end is not after its start
   * (SMS-79 H4) — the case that once left a master with no working hours
   * saved. True when every row is complete and in order.
   */
  function timesValid(): boolean {
    let valid = true;
    for (const row of [...weeklyRows.children, ...dateRows.children]) {
      const start = row.querySelector<HTMLInputElement>('[data-part="start"]');
      const end = row.querySelector<HTMLInputElement>('[data-part="end"]');
      if (start === null || end === null) continue;
      for (const input of [start, end]) {
        if (TIME_24H.test(input.value)) continue;
        markInvalid(input, 'Choose a time.');
        valid = false;
      }
      if (TIME_24H.test(start.value) && TIME_24H.test(end.value) && end.value <= start.value) {
        markInvalid(end, 'The end time must be after the start time.');
        valid = false;
      }
    }
    return valid;
  }

  async function save(): Promise<void> {
    replace(message);
    clearInvalid(context.root);
    if (!timesValid()) {
      replace(message, notice('Please correct the marked times.', 'error'));
      return;
    }
    const weekly = [...weeklyRows.children].map((row) => ({
      dayOfWeek: Number(part(row, 'day')),
      startTime: part(row, 'start').trim(),
      endTime: part(row, 'end').trim(),
    }));
    const dates = [...dateRows.children].map((row) => ({
      date: part(row, 'date'),
      startTime: part(row, 'start').trim(),
      endTime: part(row, 'end').trim(),
    }));
    const result = await call('PUT', '/me/availability', { staff: true, body: { weekly, dates } });
    replace(
      message,
      result.ok
        ? notice('Saved.', 'ok')
        : notice(
            result.problem.errors?.map((error) => error.message).join(' ') ??
              result.problem.detail ??
              result.problem.title,
            'error',
          ),
    );
  }

  replace(
    context.root,
    h('h1', {}, 'My availability'),
    region(
      'Weekly hours',
      'h2',
      weeklyRows,
      h(
        'button',
        { type: 'button', class: 'secondary add', onclick: () => weeklyRows.append(weeklyRow()) },
        'Add',
      ),
    ),
    region(
      'Specific dates',
      'h2',
      dateRows,
      h(
        'button',
        { type: 'button', class: 'secondary add', onclick: () => dateRows.append(dateRow()) },
        'Add',
      ),
    ),
    message,
    // The one action that stores the rules, apart from the ones that edit the
    // form (SMS-76 V3): the only filled button, in its own bar.
    h(
      'div',
      { class: 'form-actions' },
      h('button', { type: 'button', class: 'primary', onclick: () => void save() }, 'Save'),
    ),
  );
}
