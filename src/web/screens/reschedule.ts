/**
 * C3 — Reschedule (`/appointments/{token}/reschedule`).
 *
 * The same order as C1 (UI-GATE U-2): a new date and time first, from the
 * union of the free times of the masters who offer all of the appointment's
 * services; then the master among those free at that time, the current master
 * first and preselected when free. P11 moves the appointment (`masterId` only
 * when it changes); there is no counter and no deadline (REQ-F-007).
 *
 * Source: REQ-F-007, 008, 009, 029; SCN-03, SCN-11; spec/ui/screens.md §4.3;
 *         error-model.md §3.1.
 */

import { call, setFlash } from '../api.js';
import { field, h, notice, region, replace } from '../dom.js';
import { formatStart, formatTime } from '../format.js';
import type { ScreenContext } from '../main.js';
import { eligibleOffers, freeTimes, loadOffers, type Offer } from '../offers.js';
import { loadByToken, NOT_FOUND } from './confirmation.js';

const NOT_ACTIVE = 'This appointment can no longer be changed.';
const SLOT_TAKEN = 'This time is no longer available. Please choose another time.';
const NO_TIME = 'No free time on this date. Please choose another date.';

/** Renders C3. */
export async function renderReschedule(context: ScreenContext): Promise<void> {
  document.title = 'Reschedule — Salon';
  const token = context.params[0] ?? '';
  const back = h('a', { href: `/appointments/${token}` }, 'Back to my appointment');
  const appointment = await loadByToken(token);
  if (appointment === null) {
    replace(
      context.root,
      h('main', { class: 'page' }, h('h1', {}, 'Reschedule'), notice(NOT_FOUND, 'error'), back),
    );
    return;
  }

  const { offers } = await loadOffers();
  const serviceIds = appointment.services.map((service) => service.serviceId);
  const eligible = eligibleOffers(offers, serviceIds).sort(
    (a, b) =>
      Number(b.master.id === appointment.master.id) - Number(a.master.id === appointment.master.id),
  );

  let byStart: ReadonlyMap<string, readonly string[]> = new Map();
  let chosenStart: string | null = null;
  let chosenMaster: Offer | null = null;
  let loadToken = 0;

  const dateInput = h('input', { type: 'date', name: 'date' });
  dateInput.addEventListener('change', () => void loadTimes());
  const slotList = h('div', { class: 'slots', role: 'group', 'aria-label': 'Free times' });
  const timeMessage = h('div', { class: 'messages' });
  const masterList = h('div', { class: 'choices' });
  const message = h('div', { class: 'messages' });
  const confirm = h(
    'button',
    { type: 'button', disabled: true, onclick: () => void submit() },
    'Confirm new time',
  );

  async function loadTimes(): Promise<void> {
    chosenStart = null;
    chosenMaster = null;
    replace(slotList);
    replace(masterList);
    replace(timeMessage);
    confirm.disabled = true;
    if (dateInput.value === '') return;
    const token = ++loadToken;
    const found = await freeTimes(eligible, dateInput.value, serviceIds);
    if (token !== loadToken) return;
    if (found.problem !== null)
      replace(timeMessage, notice(found.problem.detail ?? found.problem.title, 'error'));
    byStart = found.byStart;
    renderSlots();
  }

  function renderSlots(): void {
    const starts = [...byStart.keys()].sort();
    if (starts.length === 0) {
      replace(timeMessage, notice(NO_TIME, 'info'));
      return;
    }
    replace(
      slotList,
      ...starts.map((startAt) =>
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
    chosenMaster = null;
    const free = new Set(chosenStart === null ? [] : (byStart.get(chosenStart) ?? []));
    const candidates = eligible.filter((offer) => free.has(offer.master.id));
    replace(
      masterList,
      ...candidates.map((offer) => {
        const preselect = offer.master.id === appointment?.master.id;
        const radio = h('input', {
          type: 'radio',
          name: 'master',
          value: offer.master.id,
          checked: preselect,
        });
        if (preselect) chosenMaster = offer;
        radio.addEventListener('change', () => {
          chosenMaster = offer;
          confirm.disabled = false;
        });
        return h('label', { class: 'choice' }, radio, ` ${offer.master.fullName}`);
      }),
    );
    confirm.disabled = chosenMaster === null;
  }

  async function submit(): Promise<void> {
    if (chosenStart === null || chosenMaster === null || appointment === null) return;
    replace(message);
    confirm.disabled = true;
    const body: Record<string, string> = { startAt: chosenStart };
    if (chosenMaster.master.id !== appointment.master.id) body.masterId = chosenMaster.master.id;
    const result = await call('POST', `/appointments/${encodeURIComponent(token)}/reschedule`, {
      body,
    });
    confirm.disabled = false;
    if (result.ok) {
      setFlash('Your appointment has been rescheduled.');
      location.assign(`/appointments/${token}`);
      return;
    }
    if (result.problem.code === 'INVALID_STATE_TRANSITION') {
      replace(message, notice(NOT_ACTIVE, 'error'));
    } else if (result.problem.code === 'SLOT_UNAVAILABLE') {
      await loadTimes();
      replace(message, notice(SLOT_TAKEN, 'error'));
    } else {
      replace(message, notice(result.problem.detail ?? result.problem.title, 'error'));
    }
  }

  replace(
    context.root,
    h(
      'main',
      { class: 'page' },
      h('h1', {}, 'Reschedule'),
      region(
        'Current time',
        'h2',
        h('p', {}, formatStart(appointment.startAt)),
        h('p', {}, appointment.master.fullName),
      ),
      region('Choose a new time', 'h2', field('New date', dateInput), timeMessage, slotList),
      region('Choose a master', 'h2', masterList),
      message,
      h('div', { class: 'actions' }, confirm, back),
    ),
  );
}
