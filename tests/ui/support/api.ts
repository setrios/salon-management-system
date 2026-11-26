/**
 * Arrangement through the approved API, for the browser tests.
 *
 * A browser test asserts what the interface shows; what it shows is created
 * here, through the same operations an administrator or a client would call,
 * so the data is exactly what the contract produces. Nothing here touches the
 * interface.
 */

import { expect, type APIRequestContext } from '@playwright/test';

import { ADMIN } from './db.js';

/** A staff member the tests can sign in as. */
export interface Staff {
  readonly id: string;
  readonly fullName: string;
  readonly username: string;
  readonly password: string;
  readonly token: string;
}

/** A service, with the base duration the interface sums. */
export interface ServiceFixture {
  readonly id: string;
  readonly name: string;
  readonly baseDurationMinutes: number;
}

/** A booked appointment, as P8 answered it. */
export interface Booked {
  readonly id: string;
  readonly accessToken: string;
  readonly confirmationUrl: string;
  readonly startAt: string;
}

/** Signs in through A1 and returns the bearer token. */
export async function signIn(
  api: APIRequestContext,
  username: string,
  password: string,
): Promise<string> {
  const response = await api.post('/api/v1/auth/login', { data: { username, password } });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

/** The administrator of `resetDatabase()`, signed in. */
export async function signInAdmin(api: APIRequestContext): Promise<string> {
  return signIn(api, ADMIN.username, ADMIN.password);
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Creates a master through R2 and signs them in. */
export async function createMaster(
  api: APIRequestContext,
  adminToken: string,
  fullName: string,
): Promise<Staff> {
  const username = fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const password = `${username}-password`;
  const response = await api.post('/api/v1/admin/masters', {
    headers: bearer(adminToken),
    data: { fullName, username, password },
  });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  return { id, fullName, username, password, token: await signIn(api, username, password) };
}

/** Creates a service through R6. */
export async function createService(
  api: APIRequestContext,
  adminToken: string,
  name: string,
  baseDurationMinutes: number,
  category = 'Hair',
): Promise<ServiceFixture> {
  const response = await api.post('/api/v1/admin/services', {
    headers: bearer(adminToken),
    data: { name, category, baseDurationMinutes },
  });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  return { id, name, baseDurationMinutes };
}

/** Links a service to a master at a price in hryvnias, through R11. */
export async function linkService(
  api: APIRequestContext,
  adminToken: string,
  masterId: string,
  serviceId: string,
  priceUah: number,
): Promise<void> {
  const response = await api.post('/api/v1/admin/master-services', {
    headers: bearer(adminToken),
    data: { masterId, serviceId, price: { amountMinor: priceUah * 100, currency: 'UAH' } },
  });
  expect(response.status()).toBe(201);
}

/** Gives a master the same working hours on every day of the week, through M4. */
export async function workEveryDay(
  api: APIRequestContext,
  master: Staff,
  startTime = '09:00',
  endTime = '18:00',
): Promise<void> {
  const weekly = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, startTime, endTime }));
  const response = await api.put('/api/v1/me/availability', {
    headers: bearer(master.token),
    data: { weekly, dates: [] },
  });
  expect(response.status()).toBe(200);
}

/** Books through P8, as a client would. */
export async function book(
  api: APIRequestContext,
  input: {
    readonly masterId: string;
    readonly serviceIds: readonly string[];
    readonly startAt: string;
    readonly name?: string;
    readonly phone?: string;
  },
): Promise<Booked> {
  const response = await api.post('/api/v1/appointments', {
    data: {
      client: { name: input.name ?? 'Olena Shevchenko', phone: input.phone ?? '+380501112233' },
      masterId: input.masterId,
      serviceIds: input.serviceIds,
      startAt: input.startAt,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as Booked;
}

/** Cancels through P10. */
export async function cancelByToken(api: APIRequestContext, token: string): Promise<void> {
  const response = await api.post(`/api/v1/appointments/${token}/cancel`);
  expect(response.status()).toBe(200);
}

/** Marks an appointment completed through R23. */
export async function complete(
  api: APIRequestContext,
  adminToken: string,
  appointmentId: string,
): Promise<void> {
  const response = await api.post(`/api/v1/admin/appointments/${appointmentId}/complete`, {
    headers: bearer(adminToken),
  });
  expect(response.status()).toBe(200);
}

/** Creates a material through R14. */
export async function createMaterial(
  api: APIRequestContext,
  adminToken: string,
  name: string,
  unit: string,
  initialStockQuantity: number,
): Promise<string> {
  const response = await api.post('/api/v1/admin/materials', {
    headers: bearer(adminToken),
    data: { name, unit, initialStockQuantity },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** Calls any operation with a bearer token and returns the parsed body. */
export async function getJson<T>(api: APIRequestContext, path: string, token?: string): Promise<T> {
  const response = await api.get(path, token === undefined ? {} : { headers: bearer(token) });
  expect(response.status()).toBe(200);
  return (await response.json()) as T;
}
