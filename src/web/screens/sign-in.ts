/**
 * S1 — Sign in (`/staff/login`).
 *
 * A1 with the username and password, then A2 for the role, then the role's
 * first screen. No sign-up and no reset link: accounts are created by the
 * administrator (REQ-F-012) and reset is out of scope (glossary). A banner
 * left by a session that ended (any 401) is shown above the form.
 *
 * Source: REQ-F-012, REQ-F-017; spec/ui/screens.md §5.1.
 */

import { call, read, storeStaffToken } from '../api.js';
import { field, h, notice, replace } from '../dom.js';
import type { ScreenContext } from '../main.js';
import { homeOf, type Principal } from '../staff.js';

/** Renders S1. */
export function renderSignIn(context: ScreenContext): Promise<void> {
  document.title = 'Sign in — Salon';
  const username = h('input', {
    type: 'text',
    name: 'username',
    autocomplete: 'username',
    required: true,
  });
  const password = h('input', {
    type: 'password',
    name: 'password',
    autocomplete: 'current-password',
    required: true,
  });
  const message = h('div', { class: 'messages' });
  if (context.flash !== null) replace(message, notice(context.flash, 'info'));

  const submit = h('button', { type: 'submit' }, 'Sign in');
  const form = h(
    'form',
    { class: 'form narrow' },
    field('Username', username),
    field('Password', password),
    submit,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void signIn();
  });

  async function signIn(): Promise<void> {
    submit.disabled = true;
    const result = await call<{ accessToken: string }>('POST', '/auth/login', {
      body: { username: username.value, password: password.value },
    });
    submit.disabled = false;
    if (!result.ok) {
      replace(
        message,
        notice(
          result.problem.status === 401 ? 'Wrong username or password.' : result.problem.title,
          'error',
        ),
      );
      return;
    }
    storeStaffToken(result.body.accessToken);
    const principal = await read<Principal>('/auth/me', { staff: true });
    location.assign(homeOf(principal.role));
  }

  replace(context.root, h('main', { class: 'page narrow' }, h('h1', {}, 'Sign in'), message, form));
  return Promise.resolve();
}
