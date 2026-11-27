/**
 * DOM helpers for the interface: element creation, labelled fields, regions
 * and messages.
 *
 * The screens are built from these few shapes so that the accessible names
 * `spec/ui/screens.md` §11 fixes come out the same everywhere: a step is a
 * region named by its heading (K1), a field is an input with a `<label>` (K4),
 * a field error sets `aria-invalid` (K7).
 *
 * Source: spec/ui/screens.md §2, §11.
 */

/** A child of an element: a node, text, or nothing. */
export type Child = Node | string | number | null | undefined | false;

/** Attributes and event handlers of an element; `true` / `false` toggle a boolean attribute. */
export type Props = Record<string, string | number | boolean | EventListener | null | undefined>;

let counter = 0;

/** A document-unique id with a readable prefix. */
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * Creates an element.
 *
 * `on<event>` props become listeners; `true`/`false` set or omit a boolean
 * attribute; `null`/`undefined` are skipped; anything else is an attribute.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') {
      element.addEventListener(key.slice(2), value);
    } else if (value === true) {
      element.setAttribute(key, '');
    } else {
      element.setAttribute(key, String(value));
    }
  }
  append(element, ...children);
  return element;
}

/** Appends children, skipping the empty ones. */
export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Replaces every child of `parent`. */
export function replace(parent: Element, ...children: Child[]): void {
  parent.replaceChildren();
  append(parent, ...children);
}

/** A section whose accessible name is its heading — a `region` (K1). */
export function region(title: string, level: 'h2' | 'h3', ...children: Child[]): HTMLElement {
  const id = uid('region');
  return h(
    'section',
    { 'aria-labelledby': id, class: 'region' },
    h(level, { id }, title),
    ...children,
  );
}

/** A control paired with its `<label>`; returns both, wrapped. */
export function field(
  label: string,
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): HTMLElement {
  if (control.id === '') control.id = uid('field');
  return h('div', { class: 'field' }, h('label', { for: control.id }, label), control);
}

/** A `<select>` with the given options; `value` is the option's value, `label` its text. */
export function select(
  options: ReadonlyArray<{ readonly value: string; readonly label: string }>,
  props: Props = {},
): HTMLSelectElement {
  return h(
    'select',
    props,
    ...options.map((option) => h('option', { value: option.value }, option.label)),
  );
}

/** A `<datalist>` of suggestions for a text input (K9); returns the list, with its id set. */
export function suggestions(values: readonly string[]): HTMLDataListElement {
  return h('datalist', { id: uid('list') }, ...values.map((value) => h('option', { value })));
}

/** A status line: a polite announcement, styled by `kind`. */
export function notice(text: string, kind: 'ok' | 'info' | 'error' = 'info'): HTMLElement {
  return h(
    'p',
    { class: `notice notice-${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    text,
  );
}

/** Marks a field invalid (K7) and puts the message after it. */
export function markInvalid(control: HTMLElement, message: string): void {
  control.setAttribute('aria-invalid', 'true');
  const hint = h('p', { class: 'field-error', id: uid('error') }, message);
  control.setAttribute('aria-describedby', hint.id);
  control.insertAdjacentElement('afterend', hint);
}

/** Clears every field error inside `scope`. */
export function clearInvalid(scope: Element): void {
  for (const control of scope.querySelectorAll('[aria-invalid="true"]')) {
    control.removeAttribute('aria-invalid');
    control.removeAttribute('aria-describedby');
  }
  for (const hint of scope.querySelectorAll('.field-error')) hint.remove();
}

/** A table with a header row; `rows` are arrays of cells. */
export function table(
  headers: readonly string[],
  rows: ReadonlyArray<readonly Child[]>,
): HTMLElement {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, ...headers.map((name) => h('th', { scope: 'col' }, name)))),
      h(
        'tbody',
        {},
        ...rows.map((cells) => h('tr', {}, ...cells.map((cell) => h('td', {}, cell)))),
      ),
    ),
  );
}

/** A time of day, `HH:MM` in 24 hours (UI-GATE U-4). */
export const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A time field: the browser's own time control (UI-GATE U-4 as amended,
 * SMS-79), drawn in the browser's hour cycle. Whatever it shows, its value is
 * `HH:MM` in 24 hours — the contract's form — or `''` while incomplete.
 *
 * @param value - the stored time, or `''` for a new row.
 */
export function timeInput(value: string, props: Props = {}): HTMLInputElement {
  return h('input', { type: 'time', value, ...props });
}
