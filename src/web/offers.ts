/**
 * Who can do what, and when — the shared logic of C1, C3 and A2.
 *
 * An *offer* is an active master with their price per service (P4 + P6). An
 * offer is *eligible* for a set of services when it prices every one of them.
 * Availability is per master in the contract (P7 needs `masterId`), so the
 * free times of a set of masters are the union of one P7 call per master.
 *
 * Source: REQ-F-001, REQ-F-002; spec/ui/screens.md §4.1 (eligible master,
 *         union of slots), §4.3; UI-GATE U-2.
 */

import { call, readAll, type Problem } from './api.js';
import type { Money } from './format.js';

/** A service of the public catalogue (P1). */
export interface Service {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly baseDurationMinutes: number;
}

/** A master as the public lists show them (P4). */
export interface Master {
  readonly id: string;
  readonly fullName: string;
}

/** An active master and their price for each service they offer. */
export interface Offer {
  readonly master: Master;
  readonly prices: ReadonlyMap<string, Money>;
}

interface Link {
  readonly serviceId: string;
  readonly price: Money;
  readonly active: boolean;
}

interface Slot {
  readonly startAt: string;
  readonly available: boolean;
}

/** The free times of several masters: each start, with the masters free then. */
export interface FreeTimes {
  readonly byStart: ReadonlyMap<string, readonly string[]>;
  /** The first problem a P7 call answered, if any (e.g. a date in the past). */
  readonly problem: Problem | null;
}

/** Active services (P1) and every active master's active links (P4, P6). */
export async function loadOffers(): Promise<{ services: Service[]; offers: Offer[] }> {
  const [services, masters] = await Promise.all([
    readAll<Service>('/services'),
    readAll<Master>('/masters?active=true'),
  ]);
  const offers = await Promise.all(
    masters.map(async (master) => {
      const links = await readAll<Link>(`/masters/${master.id}/services?active=true`);
      const active = links.filter((link) => link.active);
      return { master, prices: new Map(active.map((link) => [link.serviceId, link.price])) };
    }),
  );
  return { services, offers };
}

/** The offers that price every given service. */
export function eligibleOffers(offers: readonly Offer[], serviceIds: Iterable<string>): Offer[] {
  const ids = [...serviceIds];
  return offers.filter((offer) => ids.every((id) => offer.prices.has(id)));
}

/** One master's total price for the given services (REQ-F-001). */
export function totalPrice(offer: Offer, serviceIds: readonly string[]): Money {
  let amountMinor = 0;
  for (const id of serviceIds) amountMinor += offer.prices.get(id)?.amountMinor ?? 0;
  return { amountMinor, currency: 'UAH' };
}

/** The union of the masters' free times on a date for the services (P7 per master). */
export async function freeTimes(
  offers: readonly Offer[],
  date: string,
  serviceIds: readonly string[],
): Promise<FreeTimes> {
  const answers = await Promise.all(
    offers.map(async (offer) => ({
      offer,
      result: await call<{ slots: Slot[] }>(
        'GET',
        `/masters/${offer.master.id}/availability?date=${date}&serviceIds=${serviceIds.join(',')}`,
      ),
    })),
  );
  const byStart = new Map<string, string[]>();
  let problem: Problem | null = null;
  for (const { offer, result } of answers) {
    if (!result.ok) {
      problem ??= result.problem;
      continue;
    }
    for (const slot of result.body.slots) {
      if (slot.available)
        byStart.set(slot.startAt, [...(byStart.get(slot.startAt) ?? []), offer.master.id]);
    }
  }
  return { byStart, problem };
}
