/**
 * C1 — Book an appointment (`/`), and A2 — New appointment, which is the same
 * four steps for the administrator.
 *
 * Steps in the order of UI-GATE U-2: services → date and time → master →
 * details. An *eligible master* is an active master whose active links cover
 * every ticked service. The contract computes availability per master (P7
 * needs `masterId`), so the time step asks P7 once per eligible master and
 * offers the union of their free slots; the master step lists the eligible
 * masters free at the chosen slot, each with that master's total price
 * (REQ-F-001). Changing a step clears the steps after it.
 *
 * Source: REQ-F-001, 002, 003, 004, 019, 031; REQ-NF-007, 008; SCN-01, SCN-13;
 *         spec/ui/screens.md §4.1, §5.3 (A2), §11 K1, K3, K4, K6, K7, K12.
 */

import { call, setFlash, type FieldError } from '../api.js';
import { clearInvalid, field, h, markInvalid, notice, region, replace } from '../dom.js';
import { formatMinutes, formatMoney, formatTime } from '../format.js';
import type { ScreenContext } from '../main.js';
import { eligibleOffers, freeTimes, loadOffers, totalPrice, type Offer } from '../offers.js';

/** Who books: the client through P8, or the administrator through R19. */
export type BookingMode = 'client' | 'admin';

const SLOT_TAKEN = 'This time is no longer available. Please choose another time.';
const NO_MASTER = 'No master offers all of these services together. Remove a service to continue.';
const NO_TIME = 'No free time on this date. Please choose another date.';

/** Renders C1 (`mode = 'client'`) or A2 (`mode = 'admin'`). */
export async function renderBooking(context: ScreenContext, mode: BookingMode): Promise<void> {
  if (mode === 'client') document.title = 'Book an appointment — Salon';
  const { services, offers } = await loadOffers();

  const offered = new Set(offers.flatMap((offer) => [...offer.prices.keys()]));
  const visible = services
    .filter((service) => offered.has(service.id))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const selected = new Set<string>();
  let slotsByStart: ReadonlyMap<string, readonly string[]> = new Map(); // startAt → masters free then
  let chosenStart: string | null = null;
  let chosenMaster: Offer | null = null;
  let loadToken = 0;

  // --- Step 1: services ----------------------------------------------------
  const durationLine = h('p', { class: 'total' });
  const servicesMessage = h('div', { class: 'messages' });
  const categories = [...new Set(visible.map((service) => service.category))];
  const groups = categories.map((category) =>
    h(
      'fieldset',
      { class: 'choices' },
      h('legend', {}, category),
      ...visible
        .filter((service) => service.category === category)
        .map((service) => {
          const box = h('input', { type: 'checkbox', value: service.id });
          box.addEventListener('change', () => {
            if (box.checked) selected.add(service.id);
            else selected.delete(service.id);
            onServicesChanged();
          });
          return h(
            'label',
            { class: 'choice' },
            box,
            ` ${service.name} — ${formatMinutes(service.baseDurationMinutes)}`,
          );
        }),
    ),
  );
  const servicesStep = region(
    'Choose services',
    'h2',
    visible.length === 0 ? notice('No services can be booked at the moment.', 'info') : null,
    ...groups,
    durationLine,
    servicesMessage,
  );

  // --- Step 2: date and time ---------------------------------------------
  const dateInput = h('input', { type: 'date', name: 'date', disabled: true });
  dateInput.addEventListener('change', () => void onDateChanged());
  const slotList = h('div', { class: 'slots', role: 'group', 'aria-label': 'Free times' });
  const timeMessage = h('div', { class: 'messages' });
  const timeStep = region(
    'Choose a date and time',
    'h2',
    field('Date', dateInput),
    timeMessage,
    slotList,
  );

  // --- Step 3: master ----------------------------------------------------
  const masterList = h('div', { class: 'choices' });
  const masterStep = region('Choose a master', 'h2', masterList);

  // --- Step 4: details ---------------------------------------------------
  const name = h('input', {
    type: 'text',
    name: 'name',
    autocomplete: 'name',
    'data-field': 'client.name',
  });
  const phone = h('input', {
    type: 'tel',
    name: 'phone',
    autocomplete: 'tel',
    placeholder: '+380…',
    'data-field': 'client.phone',
  });
  const summary = h('div', { class: 'summary' });
  const submit = h(
    'button',
    { type: 'submit', disabled: true },
    mode === 'client' ? 'Book' : 'Create appointment',
  );
  const detailsMessage = h('div', { class: 'messages' });
  const form = h(
    'form',
    { class: 'form' },
    field('Name', name),
    field('Phone', phone),
    summary,
    detailsMessage,
    submit,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void book();
  });
  const detailsStep = region(mode === 'client' ? 'Your details' : 'Client details', 'h2', form);

  function eligible(): Offer[] {
    return eligibleOffers(offers, selected);
  }

  function selectedIds(): string[] {
    return visible.filter((service) => selected.has(service.id)).map((service) => service.id);
  }

  function renderSummary(): void {
    const minutes = visible
      .filter((service) => selected.has(service.id))
      .reduce((sum, service) => sum + service.baseDurationMinutes, 0);
    replace(durationLine, selected.size === 0 ? null : `Total duration: ${formatMinutes(minutes)}`);
    replace(
      summary,
      selected.size === 0
        ? null
        : h('p', { class: 'total' }, `Total duration: ${formatMinutes(minutes)}`),
      chosenMaster === null
        ? null
        : h(
            'p',
            { class: 'total' },
            `Total price: ${formatMoney(totalPrice(chosenMaster, selectedIds()))}`,
          ),
    );
    submit.disabled = chosenStart === null || chosenMaster === null;
  }

  function clearFromTime(): void {
    slotsByStart = new Map();
    chosenStart = null;
    replace(slotList);
    replace(timeMessage);
    clearFromMaster();
  }

  function clearFromMaster(): void {
    chosenMaster = null;
    replace(masterList);
    replace(detailsMessage);
    renderSummary();
  }

  function onServicesChanged(): void {
    clearFromTime();
    replace(servicesMessage);
    const canChooseTime = selected.size > 0 && eligible().length > 0;
    if (selected.size > 0 && !canChooseTime) replace(servicesMessage, notice(NO_MASTER, 'error'));
    dateInput.disabled = !canChooseTime;
    renderSummary();
    if (canChooseTime && dateInput.value !== '') void onDateChanged();
  }

  async function onDateChanged(): Promise<void> {
    clearFromTime();
    if (dateInput.value === '' || selected.size === 0) return;
    const token = ++loadToken;
    const found = await freeTimes(eligible(), dateInput.value, selectedIds());
    if (token !== loadToken) return; // a newer choice superseded this one
    if (found.problem !== null) {
      replace(timeMessage, notice(found.problem.detail ?? found.problem.title, 'error'));
    }
    slotsByStart = found.byStart;
    renderSlots();
  }

  function renderSlots(): void {
    const starts = [...slotsByStart.keys()].sort();
    if (starts.length === 0) {
      replace(timeMessage, notice(NO_TIME, 'info'));
      replace(slotList);
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
    clearFromMaster();
    if (chosenStart === null) return;
    const free = new Set(slotsByStart.get(chosenStart) ?? []);
    const ids = selectedIds();
    replace(
      masterList,
      ...eligible()
        .filter((offer) => free.has(offer.master.id))
        .map((offer) => {
          const radio = h('input', { type: 'radio', name: 'master', value: offer.master.id });
          radio.addEventListener('change', () => {
            chosenMaster = offer;
            renderSummary();
          });
          return h(
            'label',
            { class: 'choice' },
            radio,
            ` ${offer.master.fullName} — ${formatMoney(totalPrice(offer, ids))}`,
          );
        }),
    );
  }

  async function book(): Promise<void> {
    if (chosenStart === null || chosenMaster === null) return;
    clearInvalid(form);
    replace(detailsMessage);
    submit.disabled = true;
    const result = await call<{ id: string; confirmationUrl?: string }>(
      'POST',
      mode === 'client' ? '/appointments' : '/admin/appointments',
      {
        staff: mode === 'admin',
        body: {
          client: { name: name.value.trim(), phone: phone.value.trim() },
          masterId: chosenMaster.master.id,
          serviceIds: selectedIds(),
          startAt: chosenStart,
        },
      },
    );
    submit.disabled = false;

    if (result.ok) {
      if (mode === 'client' && result.body.confirmationUrl !== undefined) {
        setFlash('Your appointment is confirmed.');
        location.assign(new URL(result.body.confirmationUrl).pathname);
      } else {
        setFlash('The appointment is created.');
        location.assign(`/staff/admin/appointments/${result.body.id}`);
      }
      return;
    }

    const problem = result.problem;
    if (problem.code === 'SLOT_UNAVAILABLE') {
      await onDateChanged();
      replace(timeMessage, notice(SLOT_TAKEN, 'error'));
      return;
    }
    if (problem.errors !== undefined && problem.errors.length > 0) {
      showFieldErrors(form, problem.errors);
      replace(detailsMessage, notice('Please correct the marked fields.', 'error'));
      return;
    }
    replace(detailsMessage, notice(problem.detail ?? problem.title, 'error'));
  }

  const heading =
    mode === 'client' ? h('h1', {}, 'Book an appointment') : h('h1', {}, 'New appointment');
  replace(
    context.root,
    h(
      mode === 'client' ? 'main' : 'div',
      { class: 'page booking' },
      heading,
      context.flash === null ? null : notice(context.flash, 'ok'),
      servicesStep,
      timeStep,
      masterStep,
      detailsStep,
    ),
  );
}

/** Marks each `errors[]` item on the input whose `data-field` is its path (K7). */
export function showFieldErrors(scope: HTMLElement, errors: readonly FieldError[]): void {
  for (const error of errors) {
    const control = scope.querySelector<HTMLElement>(`[data-field="${error.field}"]`);
    if (control !== null) markInvalid(control, error.message);
  }
}
