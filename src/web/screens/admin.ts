/**
 * The administrator's appointment screens: A1 Appointments, A2 New
 * appointment, A3 Appointment details.
 *
 * A2 is C1's four steps through R19 (`booking.ts`). A3 shows the appointment
 * with its reminders and payment, and the actions R21 Change, R22 Cancel,
 * R23 Mark as completed and R27 Record payment. Payment is offered only once
 * the appointment is completed (REQ-F-021, REQ-F-027); a recorded payment is
 * shown, never edited.
 *
 * Source: REQ-F-008, 010, 011, 019, 021, 027, 028, 029, 030;
 *         spec/ui/screens.md §5.3 (A1–A3), §11 K2, K4, K11.
 */

import { call, read, readAll } from '../api.js';
import { field, h, notice, region, replace, select, table } from '../dom.js';
import {
  addDays,
  formatChannel,
  formatDelivery,
  formatEvent,
  formatInstant,
  formatMethod,
  formatMinutes,
  formatMoney,
  formatSpan,
  formatStatus,
  formatTime,
  mondayOf,
  parseAmount,
  salonToday,
  type Money,
} from '../format.js';
import { eligibleOffers, freeTimes, loadOffers, type Offer } from '../offers.js';
import type { StaffContext } from '../staff.js';
import { renderBooking, showFieldErrors } from './booking.js';
import type { StaffAppointment } from './master.js';

interface AdminAppointment extends StaffAppointment {
  readonly reminders: ReadonlyArray<{
    readonly type: string;
    readonly scheduledAt: string;
    readonly status: string;
  }>;
  readonly payment?: {
    readonly amount: Money;
    readonly method: string;
    readonly status: string;
    readonly recordedAt: string;
  };
}

interface AdminMaster {
  readonly id: string;
  readonly fullName: string;
}

interface Notification {
  readonly audience: string;
  readonly eventType: string;
  readonly channel: string;
  readonly status: string;
  readonly createdAt: string;
}

/** A1 — Appointments. */
export async function renderAppointmentList(context: StaffContext): Promise<void> {
  const masters = await readAll<AdminMaster>('/admin/masters', { staff: true });
  const today = salonToday();
  const from = h('input', { type: 'date', value: mondayOf(today) });
  const to = h('input', { type: 'date', value: addDays(mondayOf(today), 6) });
  const master = select([
    { value: '', label: 'Any' },
    ...masters.map((item) => ({ value: item.id, label: item.fullName })),
  ]);
  const status = select([
    { value: '', label: 'Any' },
    ...['confirmed', 'completed', 'cancelled'].map((value) => ({
      value,
      label: formatStatus(value),
    })),
  ]);
  const list = h('div');
  let loadToken = 0;

  async function load(): Promise<void> {
    const query = new URLSearchParams();
    if (from.value !== '') query.set('from', from.value);
    if (to.value !== '') query.set('to', to.value);
    if (master.value !== '') query.set('masterId', master.value);
    if (status.value !== '') query.set('status', status.value);
    const token = ++loadToken;
    const items = await readAll<AdminAppointment>(`/admin/appointments?${query.toString()}`, {
      staff: true,
    });
    if (token !== loadToken) return;
    items.sort((a, b) => a.startAt.localeCompare(b.startAt));
    if (items.length === 0) {
      replace(list, notice('No appointments match these filters.', 'info'));
      return;
    }
    const body = h(
      'tbody',
      {},
      ...items.map((item) =>
        h(
          'tr',
          {
            class: 'clickable',
            onclick: () => location.assign(`/staff/admin/appointments/${item.id}`),
          },
          h(
            'td',
            {},
            h(
              'a',
              { href: `/staff/admin/appointments/${item.id}` },
              formatSpan(item.startAt, item.endAt),
            ),
          ),
          h('td', {}, item.client.name),
          h('td', {}, item.master.fullName),
          h('td', {}, item.services.map((service) => service.name).join(', ')),
          h('td', {}, formatMoney(item.totalPrice)),
          h('td', {}, formatStatus(item.status)),
        ),
      ),
    );
    replace(
      list,
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          {},
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              ...['When', 'Client', 'Master', 'Services', 'Total', 'Status'].map((name) =>
                h('th', { scope: 'col' }, name),
              ),
            ),
          ),
          body,
        ),
      ),
    );
  }
  for (const control of [from, to, master, status])
    control.addEventListener('change', () => void load());

  replace(
    context.root,
    h('h1', {}, 'Appointments'),
    h(
      'button',
      { type: 'button', onclick: () => location.assign('/staff/admin/appointments/new') },
      'New appointment',
    ),
    h(
      'div',
      { class: 'filters' },
      field('From', from),
      field('To', to),
      field('Master', master),
      field('Status', status),
    ),
    list,
  );
  await load();
}

/** A2 — New appointment: the four steps of C1, through R19. */
export async function renderNewAppointment(context: StaffContext): Promise<void> {
  await renderBooking({ root: context.root, params: [], flash: context.flash }, 'admin');
}

/** A3 — Appointment details. */
export async function renderAppointmentDetails(context: StaffContext): Promise<void> {
  const id = context.params[0] ?? '';
  await show(context.root, id, context.flash);
}

async function show(root: HTMLElement, id: string, flash: string | null): Promise<void> {
  const [appointment, notifications] = await Promise.all([
    read<AdminAppointment>(`/admin/appointments/${id}`, { staff: true }),
    readAll<Notification>(`/admin/appointments/${id}/notifications`, { staff: true }),
  ]);
  const active = appointment.status === 'confirmed';
  const message = h('div', { class: 'messages' });
  const panel = h('div', { class: 'panel' });

  const reload = (banner: string): Promise<void> => show(root, id, banner);

  async function act(path: string, banner: string): Promise<void> {
    const result = await call('POST', path, { staff: true });
    if (result.ok) await reload(banner);
    else replace(message, notice(result.problem.detail ?? result.problem.title, 'error'));
  }

  function askCancel(): void {
    replace(
      panel,
      h('p', {}, 'Cancel this appointment?'),
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'danger',
            onclick: () =>
              void act(`/admin/appointments/${id}/cancel`, 'The appointment is cancelled.'),
          },
          'Yes, cancel',
        ),
        h(
          'button',
          { type: 'button', class: 'secondary', onclick: () => replace(panel) },
          'Keep it',
        ),
      ),
    );
  }

  function paymentForm(): void {
    const amount = h('input', {
      type: 'text',
      inputmode: 'decimal',
      'data-field': 'amount.amountMinor',
      value: (appointment.totalPrice.amountMinor / 100).toFixed(2),
    });
    const method = select([
      { value: 'cash', label: 'Cash' },
      { value: 'card', label: 'Card' },
    ]);
    const paid = select([
      { value: 'paid', label: 'Paid' },
      { value: 'unpaid', label: 'Unpaid' },
    ]);
    const form = h(
      'form',
      { class: 'form' },
      field('Amount (UAH)', amount),
      field('Method', method),
      field('Status', paid),
      h('button', { type: 'submit' }, 'Save'),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void (async (): Promise<void> => {
        const amountMinor = parseAmount(amount.value);
        if (amountMinor === null) {
          replace(
            message,
            notice('Enter the amount in hryvnias, for example 500 or 450.50.', 'error'),
          );
          return;
        }
        const result = await call('POST', `/admin/appointments/${id}/payments`, {
          staff: true,
          body: {
            amount: { amountMinor, currency: 'UAH' },
            method: method.value,
            status: paid.value,
          },
        });
        if (result.ok) await reload('The payment is recorded.');
        else replace(message, notice(result.problem.detail ?? result.problem.title, 'error'));
      })();
    });
    replace(panel, form);
  }

  replace(
    root,
    h('h1', {}, 'Appointment details'),
    flash === null ? null : notice(flash, 'ok'),
    h(
      'dl',
      { class: 'details' },
      h('dt', {}, 'Status'),
      h('dd', {}, formatStatus(appointment.status)),
      h('dt', {}, 'When'),
      h('dd', {}, formatSpan(appointment.startAt, appointment.endAt)),
      h('dt', {}, 'Master'),
      h('dd', {}, appointment.master.fullName),
      h('dt', {}, 'Services'),
      h(
        'dd',
        {},
        h(
          'ul',
          { class: 'plain' },
          ...appointment.services.map((service) =>
            h('li', {}, `${service.name} — ${formatMoney(service.price)}`),
          ),
        ),
      ),
      h('dt', {}, 'Total duration'),
      h('dd', {}, formatMinutes(appointment.totalDurationMinutes)),
      h('dt', {}, 'Total price'),
      h('dd', {}, formatMoney(appointment.totalPrice)),
      h('dt', {}, 'Client'),
      h(
        'dd',
        {},
        h('span', { class: 'block' }, appointment.client.name),
        h('span', { class: 'block' }, appointment.client.phone),
      ),
    ),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          type: 'button',
          disabled: !active,
          onclick: () => void changeForm(panel, appointment, message, reload),
        },
        'Change',
      ),
      h(
        'button',
        { type: 'button', class: 'secondary', disabled: !active, onclick: askCancel },
        'Cancel appointment',
      ),
      h(
        'button',
        {
          type: 'button',
          disabled: !active,
          onclick: () =>
            void act(`/admin/appointments/${id}/complete`, 'The appointment is completed.'),
        },
        'Mark as completed',
      ),
    ),
    message,
    panel,
    region(
      'Reminders',
      'h2',
      table(
        ['Reminder', 'Time', 'Status'],
        appointment.reminders.map((reminder) => [
          reminder.type,
          formatInstant(reminder.scheduledAt),
          formatDelivery(reminder.status),
        ]),
      ),
    ),
    region(
      'Payment',
      'h2',
      appointment.payment === undefined
        ? h(
            'div',
            {},
            h('p', {}, 'No payment is recorded.'),
            h(
              'button',
              {
                type: 'button',
                disabled: appointment.status !== 'completed',
                onclick: paymentForm,
              },
              'Record payment',
            ),
            appointment.status === 'completed'
              ? null
              : h(
                  'p',
                  { class: 'hint' },
                  'A payment can be recorded once the appointment is completed.',
                ),
          )
        : h(
            'dl',
            { class: 'details' },
            h('dt', {}, 'Amount'),
            h('dd', {}, formatMoney(appointment.payment.amount)),
            h('dt', {}, 'Method'),
            h('dd', {}, formatMethod(appointment.payment.method)),
            h('dt', {}, 'Status'),
            h('dd', {}, formatStatus(appointment.payment.status)),
            h('dt', {}, 'Recorded'),
            h('dd', {}, formatInstant(appointment.payment.recordedAt)),
          ),
    ),
    region(
      'Notifications',
      'h2',
      notifications.length === 0
        ? notice('No notifications.', 'info')
        : table(
            ['Created', 'To', 'Event', 'Channel', 'Status'],
            notifications.map((item) => [
              formatInstant(item.createdAt),
              item.audience === 'client'
                ? 'Client'
                : item.audience === 'master'
                  ? 'Master'
                  : 'Administrator',
              formatEvent(item.eventType),
              formatChannel(item.channel),
              formatDelivery(item.status),
            ]),
          ),
    ),
  );
}

/** A3 Change: new time (C1's slot logic) and master, and the client's details, through R21. */
async function changeForm(
  panel: HTMLElement,
  appointment: AdminAppointment,
  message: HTMLElement,
  reload: (banner: string) => Promise<void>,
): Promise<void> {
  const { offers } = await loadOffers();
  const serviceIds = appointment.services.map((service) => service.serviceId);
  const eligible = eligibleOffers(offers, serviceIds);
  let byStart: ReadonlyMap<string, readonly string[]> = new Map();
  let chosenStart: string | null = null;
  let chosenMaster: Offer | null = null;

  const date = h('input', { type: 'date' });
  const slots = h('div', { class: 'slots', role: 'group', 'aria-label': 'Free times' });
  const masters = h('div', { class: 'choices' });
  const name = h('input', {
    type: 'text',
    value: appointment.client.name,
    'data-field': 'client.name',
  });
  const phone = h('input', {
    type: 'tel',
    value: appointment.client.phone,
    'data-field': 'client.phone',
  });

  function renderSlots(): void {
    replace(
      slots,
      ...[...byStart.keys()].sort().map((startAt) =>
        h(
          'button',
          {
            type: 'button',
            class: 'slot',
            'aria-pressed': startAt === chosenStart ? 'true' : 'false',
            onclick: () => {
              chosenStart = startAt;
              renderSlots();
              renderMasters();
            },
          },
          formatTime(startAt),
        ),
      ),
    );
  }

  function renderMasters(): void {
    const free = new Set(chosenStart === null ? [] : (byStart.get(chosenStart) ?? []));
    chosenMaster = null;
    replace(
      masters,
      ...eligible
        .filter((offer) => free.has(offer.master.id))
        .map((offer) => {
          const current = offer.master.id === appointment.master.id;
          if (current) chosenMaster = offer;
          const radio = h('input', { type: 'radio', name: 'change-master', checked: current });
          radio.addEventListener('change', () => {
            chosenMaster = offer;
          });
          return h('label', { class: 'choice' }, radio, ` ${offer.master.fullName}`);
        }),
    );
  }

  date.addEventListener('change', () => {
    void (async (): Promise<void> => {
      chosenStart = null;
      chosenMaster = null;
      replace(masters);
      if (date.value === '') {
        replace(slots);
        return;
      }
      byStart = (await freeTimes(eligible, date.value, serviceIds)).byStart;
      renderSlots();
    })();
  });

  const form = h(
    'form',
    { class: 'form' },
    h('p', { class: 'hint' }, 'Choose a new date and time, or change only the client’s details.'),
    field('Date', date),
    slots,
    masters,
    field('Name', name),
    field('Phone', phone),
    h('button', { type: 'submit' }, 'Save'),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async (): Promise<void> => {
      const body: Record<string, unknown> = {};
      if (chosenStart !== null) body.startAt = chosenStart;
      if (chosenMaster !== null && chosenMaster.master.id !== appointment.master.id) {
        body.masterId = chosenMaster.master.id;
      }
      if (
        name.value.trim() !== appointment.client.name ||
        phone.value.trim() !== appointment.client.phone
      ) {
        body.client = { name: name.value.trim(), phone: phone.value.trim() };
      }
      if (Object.keys(body).length === 0) {
        replace(message, notice('Nothing to change.', 'info'));
        return;
      }
      const result = await call('PATCH', `/admin/appointments/${appointment.id}`, {
        staff: true,
        body,
      });
      if (result.ok) {
        await reload('The appointment is changed.');
        return;
      }
      if (result.problem.errors !== undefined) showFieldErrors(form, result.problem.errors);
      replace(message, notice(result.problem.detail ?? result.problem.title, 'error'));
    })();
  });
  replace(panel, form);
}
