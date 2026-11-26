/**
 * The administrator's reference data: A4 Masters, A5 Services, A6 Prices.
 *
 * Each screen is a table with an **Add …** button that opens a form submitted
 * with **Save** (K2), and per row **Edit** and **Deactivate** / **Activate**
 * (K8). Nothing is deleted (REQ-F-018, REQ-NF-005). A unique-field conflict
 * (409 `DUPLICATE_RESOURCE`) is shown next to the field that must be unique
 * (constraint 2.6).
 *
 * Source: REQ-F-012, 014, 018, 024; spec/ui/screens.md §5.3 (A4–A6), §2.6,
 *         §11 K2, K8, K9.
 */

import { call, readAll, type Problem } from '../api.js';
import {
  clearInvalid,
  field,
  h,
  markInvalid,
  notice,
  replace,
  select,
  suggestions,
  table,
} from '../dom.js';
import {
  formatActive,
  formatAmount,
  formatMinutes,
  formatMoney,
  parseAmount,
  type Money,
} from '../format.js';
import type { StaffContext } from '../staff.js';
import { showFieldErrors } from './booking.js';

interface AdminMaster {
  readonly id: string;
  readonly fullName: string;
  readonly username: string;
  readonly active: boolean;
}

interface AdminService {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly baseDurationMinutes: number;
  readonly active: boolean;
}

interface Link {
  readonly id: string;
  readonly masterId: string;
  readonly serviceId: string;
  readonly price: Money;
  readonly active: boolean;
}

/** The parts every reference-data screen shares: a message line and a form panel. */
interface Frame {
  readonly message: HTMLElement;
  readonly panel: HTMLElement;
}

function frame(): Frame {
  return { message: h('div', { class: 'messages' }), panel: h('div', { class: 'panel' }) };
}

/** Shows a problem: field errors on their inputs, a duplicate on `uniqueField`, else the detail. */
function showProblem(
  form: HTMLElement,
  frameParts: Frame,
  problem: Problem,
  uniqueField: HTMLElement | null,
  duplicateText: string,
): void {
  clearInvalid(form);
  if (problem.code === 'DUPLICATE_RESOURCE') {
    // Next to the field that must be unique (2.6); the general line only when
    // there is no such field, so the message appears once.
    if (uniqueField !== null) markInvalid(uniqueField, duplicateText);
    else replace(frameParts.message, notice(duplicateText, 'error'));
    return;
  }
  if (problem.errors !== undefined && problem.errors.length > 0)
    showFieldErrors(form, problem.errors);
  replace(frameParts.message, notice(problem.detail ?? problem.title, 'error'));
}

/** A form submitted with Save (K2). */
function saveForm(children: Node[], onSave: () => Promise<void>): HTMLFormElement {
  const form = h('form', { class: 'form' }, ...children, h('button', { type: 'submit' }, 'Save'));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void onSave();
  });
  return form;
}

/** The Deactivate / Activate button of a row (K8). */
function toggleButton(active: boolean, onToggle: () => Promise<void>): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: 'secondary', onclick: () => void onToggle() },
    active ? 'Deactivate' : 'Activate',
  );
}

// --- A4 Masters ---------------------------------------------------------------

/** A4 — Masters. */
export async function renderMasters(context: StaffContext): Promise<void> {
  const parts = frame();
  const masters = await readAll<AdminMaster>('/admin/masters', { staff: true });
  const reload = (): Promise<void> => renderMasters(context);

  async function patch(id: string, body: Record<string, unknown>): Promise<void> {
    const result = await call('PATCH', `/admin/masters/${id}`, { staff: true, body });
    if (result.ok) await reload();
    else replace(parts.message, notice(result.problem.detail ?? result.problem.title, 'error'));
  }

  function addForm(): void {
    const fullName = h('input', { type: 'text', 'data-field': 'fullName' });
    const username = h('input', { type: 'text', autocomplete: 'off', 'data-field': 'username' });
    const password = h('input', {
      type: 'password',
      autocomplete: 'new-password',
      'data-field': 'password',
    });
    const form = saveForm(
      [field('Full name', fullName), field('Username', username), field('Password', password)],
      async () => {
        const result = await call('POST', '/admin/masters', {
          staff: true,
          body: {
            fullName: fullName.value.trim(),
            username: username.value.trim(),
            password: password.value,
          },
        });
        if (result.ok) await reload();
        else showProblem(form, parts, result.problem, username, 'This username is already taken.');
      },
    );
    replace(parts.panel, h('h2', {}, 'Add master'), form);
  }

  function editForm(master: AdminMaster): void {
    const fullName = h('input', { type: 'text', value: master.fullName, 'data-field': 'fullName' });
    const form = saveForm([field('Full name', fullName)], () =>
      patch(master.id, { fullName: fullName.value.trim() }),
    );
    replace(parts.panel, h('h2', {}, `Edit ${master.fullName}`), form);
  }

  replace(
    context.root,
    h('h1', {}, 'Masters'),
    h('button', { type: 'button', onclick: addForm }, 'Add master'),
    parts.message,
    parts.panel,
    table(
      ['Name', 'Username', 'Active', ''],
      masters.map((master) => [
        master.fullName,
        master.username,
        formatActive(master.active),
        h(
          'div',
          { class: 'row-actions' },
          h(
            'button',
            { type: 'button', class: 'secondary', onclick: () => editForm(master) },
            'Edit',
          ),
          toggleButton(master.active, () => patch(master.id, { active: !master.active })),
        ),
      ]),
    ),
  );
}

// --- A5 Services --------------------------------------------------------------

/** A5 — Services. */
export async function renderServicesAdmin(context: StaffContext): Promise<void> {
  const parts = frame();
  const [services, categories] = await Promise.all([
    readAll<AdminService>('/admin/services', { staff: true }),
    call<Array<{ name: string }>>('GET', '/admin/categories', { staff: true }),
  ]);
  const categoryNames = categories.ok ? categories.body.map((category) => category.name) : [];
  const reload = (): Promise<void> => renderServicesAdmin(context);

  async function patch(
    id: string,
    body: Record<string, unknown>,
    form?: HTMLElement,
  ): Promise<void> {
    const result = await call('PATCH', `/admin/services/${id}`, { staff: true, body });
    if (result.ok) await reload();
    else if (form !== undefined) showProblem(form, parts, result.problem, null, '');
    else replace(parts.message, notice(result.problem.detail ?? result.problem.title, 'error'));
  }

  function serviceForm(title: string, service: AdminService | null): void {
    const list = suggestions(categoryNames);
    const name = h('input', { type: 'text', value: service?.name ?? '', 'data-field': 'name' });
    const category = h('input', {
      type: 'text',
      list: list.id,
      value: service?.category ?? '',
      'data-field': 'category',
    });
    const duration = h('input', {
      type: 'number',
      min: 1,
      step: 1,
      value: service?.baseDurationMinutes ?? '',
      'data-field': 'baseDurationMinutes',
    });
    const form: HTMLFormElement = saveForm(
      [field('Name', name), field('Category', category), list, field('Duration (min)', duration)],
      async () => {
        const body = {
          name: name.value.trim(),
          category: category.value.trim(),
          baseDurationMinutes: Number(duration.value),
        };
        if (service !== null) {
          await patch(service.id, body, form);
          return;
        }
        const result = await call('POST', '/admin/services', { staff: true, body });
        if (result.ok) await reload();
        else
          showProblem(
            form,
            parts,
            result.problem,
            name,
            'A service with this name already exists.',
          );
      },
    );
    replace(parts.panel, h('h2', {}, title), form);
  }

  replace(
    context.root,
    h('h1', {}, 'Services'),
    h('button', { type: 'button', onclick: () => serviceForm('Add service', null) }, 'Add service'),
    parts.message,
    parts.panel,
    table(
      ['Name', 'Category', 'Duration', 'Active', ''],
      services.map((service) => [
        service.name,
        service.category,
        formatMinutes(service.baseDurationMinutes),
        formatActive(service.active),
        h(
          'div',
          { class: 'row-actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'secondary',
              onclick: () => serviceForm(`Edit ${service.name}`, service),
            },
            'Edit',
          ),
          toggleButton(service.active, () => patch(service.id, { active: !service.active })),
        ),
      ]),
    ),
  );
}

// --- A6 Prices ----------------------------------------------------------------

/** A6 — Prices (master ↔ service links). */
export async function renderPrices(context: StaffContext): Promise<void> {
  const parts = frame();
  const [links, masters, services] = await Promise.all([
    readAll<Link>('/admin/master-services', { staff: true }),
    readAll<AdminMaster>('/admin/masters', { staff: true }),
    readAll<AdminService>('/admin/services', { staff: true }),
  ]);
  const masterName = new Map(masters.map((master) => [master.id, master.fullName]));
  const serviceName = new Map(services.map((service) => [service.id, service.name]));
  const reload = (): Promise<void> => renderPrices(context);

  async function patch(id: string, body: Record<string, unknown>): Promise<void> {
    const result = await call('PATCH', `/admin/master-services/${id}`, { staff: true, body });
    if (result.ok) await reload();
    else replace(parts.message, notice(result.problem.detail ?? result.problem.title, 'error'));
  }

  function priceInput(value?: Money): HTMLInputElement {
    return h('input', {
      type: 'text',
      inputmode: 'decimal',
      value: value === undefined ? '' : formatAmount(value.amountMinor),
      'data-field': 'price.amountMinor',
    });
  }

  function addForm(): void {
    const master = select(
      masters
        .filter((item) => item.active)
        .map((item) => ({ value: item.id, label: item.fullName })),
    );
    const service = select(
      services.filter((item) => item.active).map((item) => ({ value: item.id, label: item.name })),
    );
    const price = priceInput();
    const form = saveForm(
      [field('Master', master), field('Service', service), field('Price (UAH)', price)],
      async () => {
        const amountMinor = parseAmount(price.value);
        if (amountMinor === null) {
          clearInvalid(form);
          markInvalid(price, 'Enter the price in hryvnias, for example 450 or 450.50.');
          return;
        }
        const result = await call('POST', '/admin/master-services', {
          staff: true,
          body: {
            masterId: master.value,
            serviceId: service.value,
            price: { amountMinor, currency: 'UAH' },
          },
        });
        if (result.ok) await reload();
        else
          showProblem(
            form,
            parts,
            result.problem,
            service,
            'This master already has a price for this service.',
          );
      },
    );
    replace(parts.panel, h('h2', {}, 'Add price'), form);
  }

  function editForm(link: Link): void {
    const price = priceInput(link.price);
    const form = saveForm([field('Price (UAH)', price)], async () => {
      const amountMinor = parseAmount(price.value);
      if (amountMinor === null) {
        clearInvalid(form);
        markInvalid(price, 'Enter the price in hryvnias, for example 450 or 450.50.');
        return;
      }
      await patch(link.id, { price: { amountMinor, currency: 'UAH' } });
    });
    replace(parts.panel, h('h2', {}, 'Edit price'), form);
  }

  replace(
    context.root,
    h('h1', {}, 'Prices'),
    h('button', { type: 'button', onclick: addForm }, 'Add price'),
    parts.message,
    parts.panel,
    table(
      ['Master', 'Service', 'Price', 'Active', ''],
      links.map((link) => [
        masterName.get(link.masterId) ?? '—',
        serviceName.get(link.serviceId) ?? '—',
        formatMoney(link.price),
        formatActive(link.active),
        h(
          'div',
          { class: 'row-actions' },
          h(
            'button',
            { type: 'button', class: 'secondary', onclick: () => editForm(link) },
            'Edit price',
          ),
          toggleButton(link.active, () => patch(link.id, { active: !link.active })),
        ),
      ]),
    ),
  );
}
