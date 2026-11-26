/**
 * A7 Materials and A8 Material (with its transactions).
 *
 * A7 lists the consumables with their stock; **Add material** offers the
 * standard units and accepts a custom one (REQ-F-025, K9). A8 shows one
 * material, its ledger, and **Add transaction**: a receipt or an issue that
 * moves the stock by its quantity (REQ-F-020); an issue beyond the stock is
 * refused by the server (409 `MATERIAL_STOCK_INSUFFICIENT`).
 *
 * Source: REQ-F-018, 020, 025; spec/ui/screens.md §5.3 (A7, A8),
 *         §11 K2, K3, K4, K8, K9, K11.
 */

import { call, read, readAll } from '../api.js';
import { field, h, notice, replace, select, suggestions, table } from '../dom.js';
import { formatActive, formatDate, salonMidday, salonToday } from '../format.js';
import type { StaffContext } from '../staff.js';
import { showFieldErrors } from './booking.js';

interface Material {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly stockQuantity: number;
  readonly active: boolean;
}

interface Transaction {
  readonly type: 'receipt' | 'issue';
  readonly quantity: number;
  readonly occurredAt: string;
  readonly note?: string;
}

const INSUFFICIENT = 'Not enough stock for this issue.';

/** A7 — Materials. */
export async function renderMaterials(context: StaffContext): Promise<void> {
  const [materials, units] = await Promise.all([
    readAll<Material>('/admin/materials', { staff: true }),
    read<{ standard: string[]; custom: string[] }>('/admin/units', { staff: true }),
  ]);
  const message = h('div', { class: 'messages' });
  const panel = h('div', { class: 'panel' });
  const reload = (): Promise<void> => renderMaterials(context);

  async function patch(id: string, body: Record<string, unknown>): Promise<void> {
    const result = await call('PATCH', `/admin/materials/${id}`, { staff: true, body });
    if (result.ok) await reload();
    else replace(message, notice(result.problem.detail ?? result.problem.title, 'error'));
  }

  function materialForm(material: Material | null): void {
    const list = suggestions([...units.standard, ...units.custom]);
    const name = h('input', { type: 'text', value: material?.name ?? '', 'data-field': 'name' });
    const unit = h('input', {
      type: 'text',
      list: list.id,
      value: material?.unit ?? '',
      'data-field': 'unit',
    });
    const initial = h('input', {
      type: 'number',
      min: 0,
      step: 'any',
      value: 0,
      'data-field': 'initialStockQuantity',
    });
    const fields: Node[] = [field('Name', name), field('Unit', unit), list];
    if (material === null) fields.push(field('Initial stock', initial));
    const form = h('form', { class: 'form' }, ...fields, h('button', { type: 'submit' }, 'Save'));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void (async (): Promise<void> => {
        if (material !== null) {
          await patch(material.id, { name: name.value.trim(), unit: unit.value.trim() });
          return;
        }
        const result = await call('POST', '/admin/materials', {
          staff: true,
          body: {
            name: name.value.trim(),
            unit: unit.value.trim(),
            initialStockQuantity: Number(initial.value),
          },
        });
        if (result.ok) {
          await reload();
          return;
        }
        if (result.problem.errors !== undefined) showFieldErrors(form, result.problem.errors);
        replace(
          message,
          notice(
            result.problem.code === 'DUPLICATE_RESOURCE'
              ? 'A material with this name already exists.'
              : (result.problem.detail ?? result.problem.title),
            'error',
          ),
        );
      })();
    });
    replace(panel, h('h2', {}, material === null ? 'Add material' : `Edit ${material.name}`), form);
  }

  replace(
    context.root,
    h('h1', {}, 'Materials'),
    h('button', { type: 'button', onclick: () => materialForm(null) }, 'Add material'),
    message,
    panel,
    table(
      ['Name', 'Unit', 'In stock', 'Active', ''],
      materials.map((material) => [
        h('a', { href: `/staff/admin/materials/${material.id}` }, material.name),
        material.unit,
        String(material.stockQuantity),
        formatActive(material.active),
        h(
          'div',
          { class: 'row-actions' },
          h(
            'button',
            { type: 'button', class: 'secondary', onclick: () => materialForm(material) },
            'Edit',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'secondary',
              onclick: () => void patch(material.id, { active: !material.active }),
            },
            material.active ? 'Deactivate' : 'Activate',
          ),
        ),
      ]),
    ),
  );
}

/** A8 — one material and its transactions. */
export async function renderMaterial(context: StaffContext): Promise<void> {
  const id = context.params[0] ?? '';
  const [material, transactions] = await Promise.all([
    read<Material>(`/admin/materials/${id}`, { staff: true }),
    readAll<Transaction>(`/admin/materials/${id}/transactions`, { staff: true }),
  ]);
  const message = h('div', { class: 'messages' });
  const panel = h('div', { class: 'panel' });

  function transactionForm(): void {
    const type = select([
      { value: 'receipt', label: 'Receipt' },
      { value: 'issue', label: 'Issue' },
    ]);
    const quantity = h('input', { type: 'number', min: 0, step: 'any', 'data-field': 'quantity' });
    const date = h('input', { type: 'date', value: salonToday(), 'data-field': 'occurredAt' });
    const note = h('input', { type: 'text', maxlength: 500, 'data-field': 'note' });
    const form = h(
      'form',
      { class: 'form' },
      field('Type', type),
      field('Quantity', quantity),
      field('Date', date),
      field('Note', note),
      h('button', { type: 'submit' }, 'Save'),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void (async (): Promise<void> => {
        const body: Record<string, unknown> = {
          type: type.value,
          quantity: Number(quantity.value),
          occurredAt: salonMidday(date.value),
        };
        if (note.value.trim() !== '') body.note = note.value.trim();
        const result = await call('POST', `/admin/materials/${id}/transactions`, {
          staff: true,
          body,
        });
        if (result.ok) {
          await renderMaterial(context);
          return;
        }
        if (result.problem.code === 'MATERIAL_STOCK_INSUFFICIENT') {
          replace(message, notice(INSUFFICIENT, 'error'));
          return;
        }
        if (result.problem.errors !== undefined) showFieldErrors(form, result.problem.errors);
        replace(message, notice(result.problem.detail ?? result.problem.title, 'error'));
      })();
    });
    replace(panel, h('h2', {}, 'Add transaction'), form);
  }

  replace(
    context.root,
    h('p', {}, h('a', { href: '/staff/admin/materials' }, 'All materials')),
    h('h1', {}, material.name),
    h('p', { class: 'total' }, `In stock: ${material.stockQuantity} ${material.unit}`),
    h('button', { type: 'button', onclick: transactionForm }, 'Add transaction'),
    message,
    panel,
    h('h2', {}, 'Transactions'),
    transactions.length === 0
      ? notice('No transactions yet.', 'info')
      : table(
          ['Date', 'Type', 'Quantity', 'Note'],
          transactions.map((item) => [
            formatDate(item.occurredAt.slice(0, 10)),
            item.type === 'receipt' ? 'Receipt' : 'Issue',
            String(item.quantity),
            item.note ?? '',
          ]),
        ),
  );
}
