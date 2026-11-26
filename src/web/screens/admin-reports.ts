/**
 * A9 — Reports: revenue, popular services, stock levels.
 *
 * Three tabs. Revenue and popular services share one period control: a preset
 * (Day / Week / Month) **or** a custom From / To, never both (REQ-F-022) —
 * typing a date selects *Custom range*, choosing a preset clears the dates;
 * stock levels is a snapshot with no period (REQ-F-033). The figures are the
 * server's report, rendered as they come; 422 `INVALID_PERIOD` shows its
 * detail.
 *
 * Source: REQ-F-022, 032, 033; REQ-NF-004; spec/ui/screens.md §5.3 (A9),
 *         §11 K3, K10.
 */

import { call } from '../api.js';
import { field, h, notice, replace, select, table } from '../dom.js';
import { formatDate, formatInstant, formatMethod, formatMoney, type Money } from '../format.js';
import type { StaffContext } from '../staff.js';

interface RevenueReport {
  readonly from: string;
  readonly to: string;
  readonly totalAmount: Money;
  readonly paymentsCount: number;
  readonly byMethod: ReadonlyArray<{
    readonly method: string;
    readonly amount: Money;
    readonly count: number;
  }>;
}

interface PopularReport {
  readonly from: string;
  readonly to: string;
  readonly items: ReadonlyArray<{
    readonly rank: number;
    readonly name: string;
    readonly bookingsCount: number;
  }>;
}

interface StockReport {
  readonly asOf: string;
  readonly items: ReadonlyArray<{
    readonly name: string;
    readonly unit: string;
    readonly quantity: number;
  }>;
}

type Tab = 'revenue' | 'popular' | 'stock';

const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ['revenue', 'Revenue'],
  ['popular', 'Popular services'],
  ['stock', 'Stock levels'],
];

/** The period control (K10); answers the query string, or `null` when incomplete. */
function periodControl(): { element: HTMLElement; query: () => string | null } {
  const period = select([
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'custom', label: 'Custom range' },
  ]);
  const from = h('input', { type: 'date' });
  const to = h('input', { type: 'date' });
  // One form at a time (REQ-F-022), without a field that ignores a click
  // (SMS-76 V1): typing a date chooses the custom range, and choosing a preset
  // empties the dates, so a request never carries both forms.
  for (const input of [from, to]) {
    input.addEventListener('input', () => {
      if (input.value !== '') period.value = 'custom';
    });
  }
  period.addEventListener('change', () => {
    if (period.value === 'custom') return;
    from.value = '';
    to.value = '';
  });
  return {
    element: h(
      'div',
      { class: 'filters' },
      field('Period', period),
      field('From', from),
      field('To', to),
    ),
    query: () => {
      if (period.value !== 'custom') return `period=${period.value}`;
      if (from.value === '' || to.value === '') return null;
      return `from=${from.value}&to=${to.value}`;
    },
  };
}

/** A9 — Reports. */
export async function renderReports(context: StaffContext): Promise<void> {
  const tabList = h('div', { role: 'tablist', 'aria-label': 'Reports', class: 'tabs' });
  const panel = h('div', { role: 'tabpanel', class: 'tab-panel' });
  let current: Tab = 'revenue';

  function renderTabs(): void {
    replace(
      tabList,
      ...TABS.map(([tab, label]) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            'aria-selected': tab === current ? 'true' : 'false',
            onclick: () => {
              current = tab;
              renderTabs();
              void renderPanel();
            },
          },
          label,
        ),
      ),
    );
  }

  async function renderPanel(): Promise<void> {
    if (current === 'stock') {
      const result = await call<StockReport>('GET', '/admin/reports/stock-levels', { staff: true });
      replace(
        panel,
        result.ok
          ? h(
              'div',
              {},
              h('p', {}, `As of ${formatInstant(result.body.asOf)}`),
              table(
                ['Material', 'Unit', 'Quantity'],
                result.body.items.map((item) => [item.name, item.unit, String(item.quantity)]),
              ),
            )
          : notice(result.problem.detail ?? result.problem.title, 'error'),
      );
      return;
    }

    const control = periodControl();
    const output = h('div', { class: 'report' });
    const show = h(
      'button',
      {
        type: 'button',
        onclick: () => {
          void (async (): Promise<void> => {
            const query = control.query();
            if (query === null) {
              replace(output, notice('Choose both dates of the range.', 'error'));
              return;
            }
            if (current === 'revenue') await showRevenue(output, query);
            else await showPopular(output, query);
          })();
        },
      },
      'Show',
    );
    replace(panel, control.element, show, output);
  }

  replace(context.root, h('h1', {}, 'Reports'), tabList, panel);
  renderTabs();
  await renderPanel();
}

async function showRevenue(output: HTMLElement, query: string): Promise<void> {
  const result = await call<RevenueReport>('GET', `/admin/reports/revenue?${query}`, {
    staff: true,
  });
  if (!result.ok) {
    replace(output, notice(result.problem.detail ?? result.problem.title, 'error'));
    return;
  }
  const report = result.body;
  replace(
    output,
    h('p', {}, `${formatDate(report.from)} – ${formatDate(report.to)}`),
    h('p', { class: 'total' }, `Total: ${formatMoney(report.totalAmount)}`),
    h('p', { class: 'total' }, `Payments: ${report.paymentsCount}`),
    report.byMethod.length === 0
      ? null
      : table(
          ['Method', 'Amount', 'Payments'],
          report.byMethod.map((row) => [
            formatMethod(row.method),
            formatMoney(row.amount),
            String(row.count),
          ]),
        ),
  );
}

async function showPopular(output: HTMLElement, query: string): Promise<void> {
  const result = await call<PopularReport>('GET', `/admin/reports/popular-services?${query}`, {
    staff: true,
  });
  if (!result.ok) {
    replace(output, notice(result.problem.detail ?? result.problem.title, 'error'));
    return;
  }
  const report = result.body;
  replace(
    output,
    h('p', {}, `${formatDate(report.from)} – ${formatDate(report.to)}`),
    report.items.length === 0
      ? notice('No bookings in this period.', 'info')
      : table(
          ['Rank', 'Service', 'Bookings'],
          report.items.map((item) => [String(item.rank), item.name, String(item.bookingsCount)]),
        ),
  );
}
