/**
 * C2 — Your appointment, the Confirmation Page (`/appointments/{token}`).
 *
 * The page the SMS link opens (REQ-F-005, SMS-70). It reads the appointment
 * by its token (P9) and offers Reschedule (C3) and Cancel appointment (P10,
 * after a question). The page and its link stay valid after cancellation: it
 * then shows status Cancelled with both controls disabled, and a completed
 * appointment the same with its own reason (glossary, *Confirmation Page*).
 *
 * Source: REQ-F-004, 005, 006; REQ-NF-001, 004, 006; SCN-01, SCN-02;
 *         spec/ui/screens.md §4.2.
 */

import { call } from '../api.js';
import { h, notice, replace } from '../dom.js';
import { formatMinutes, formatMoney, formatSpan, formatStatus, type Money } from '../format.js';
import type { ScreenContext } from '../main.js';

/** The fields of the contract's `Appointment` this page shows. */
export interface PublicAppointment {
  readonly id: string;
  readonly status: 'confirmed' | 'completed' | 'cancelled';
  readonly startAt: string;
  readonly endAt: string;
  readonly master: { readonly id: string; readonly fullName: string };
  readonly client: { readonly name: string; readonly phone: string };
  readonly services: ReadonlyArray<{
    readonly serviceId: string;
    readonly name: string;
    readonly price: Money;
  }>;
  readonly totalDurationMinutes: number;
  readonly totalPrice: Money;
}

/** The message for a token that matches nothing. */
export const NOT_FOUND = 'We could not find this appointment. Check the link from your SMS.';

/** Reads the appointment by token (P9), or `null` when the token is unknown. */
export async function loadByToken(token: string): Promise<PublicAppointment | null> {
  const result = await call<PublicAppointment>('GET', `/appointments/${encodeURIComponent(token)}`);
  if (result.ok) return result.body;
  if (result.problem.status === 404) return null;
  throw new Error(result.problem.detail ?? result.problem.title);
}

/** A `<dl>` row. */
function item(term: string, ...value: Array<Node | string>): HTMLElement[] {
  return [h('dt', {}, term), h('dd', {}, ...value)];
}

/** The appointment's details as a definition list. */
export function appointmentDetails(appointment: PublicAppointment): HTMLElement {
  return h(
    'dl',
    { class: 'details' },
    ...item('Status', formatStatus(appointment.status)),
    ...item('When', formatSpan(appointment.startAt, appointment.endAt)),
    ...item('Master', appointment.master.fullName),
    ...item(
      'Services',
      h(
        'ul',
        { class: 'plain' },
        ...appointment.services.map((service) =>
          h('li', {}, `${service.name} — ${formatMoney(service.price)}`),
        ),
      ),
    ),
    ...item('Total duration', formatMinutes(appointment.totalDurationMinutes)),
    ...item('Total price', formatMoney(appointment.totalPrice)),
    ...item(
      'Your details',
      h('span', { class: 'block' }, appointment.client.name),
      h('span', { class: 'block' }, appointment.client.phone),
    ),
  );
}

/** Renders C2. */
export async function renderConfirmation(context: ScreenContext): Promise<void> {
  document.title = 'Your appointment — Salon';
  const token = context.params[0] ?? '';
  const appointment = await loadByToken(token);
  if (appointment === null) {
    replace(
      context.root,
      h('main', { class: 'page' }, h('h1', {}, 'Your appointment'), notice(NOT_FOUND, 'error')),
    );
    return;
  }
  render(context.root, token, appointment, context.flash);
}

function render(
  root: HTMLElement,
  token: string,
  appointment: PublicAppointment,
  flash: string | null,
): void {
  const active = appointment.status === 'confirmed';
  const reason =
    appointment.status === 'cancelled'
      ? 'This appointment was cancelled.'
      : appointment.status === 'completed'
        ? 'This appointment has taken place.'
        : null;

  const question = h('div', { class: 'question', hidden: true });
  const message = h('div', { class: 'messages' });

  const reschedule = h(
    'button',
    {
      type: 'button',
      disabled: !active,
      onclick: () => location.assign(`/appointments/${token}/reschedule`),
    },
    'Reschedule',
  );
  const cancel = h(
    'button',
    { type: 'button', class: 'secondary', disabled: !active, onclick: () => ask() },
    'Cancel appointment',
  );

  function ask(): void {
    replace(
      question,
      h('p', {}, 'Cancel this appointment? It is free of charge.'),
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          { type: 'button', class: 'danger', onclick: () => void confirmCancel() },
          'Yes, cancel',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'secondary',
            onclick: () => {
              question.hidden = true;
            },
          },
          'Keep it',
        ),
      ),
    );
    question.hidden = false;
  }

  async function confirmCancel(): Promise<void> {
    const result = await call<PublicAppointment>(
      'POST',
      `/appointments/${encodeURIComponent(token)}/cancel`,
    );
    if (!result.ok) {
      replace(message, notice(result.problem.detail ?? result.problem.title, 'error'));
      return;
    }
    render(root, token, result.body, 'Your appointment is cancelled.');
  }

  replace(
    root,
    h(
      'main',
      { class: 'page' },
      h('h1', {}, 'Your appointment'),
      flash === null ? null : notice(flash, 'ok'),
      appointmentDetails(appointment),
      reason === null ? null : notice(reason, 'info'),
      message,
      h('div', { class: 'actions' }, reschedule, cancel),
      question,
    ),
  );
}
