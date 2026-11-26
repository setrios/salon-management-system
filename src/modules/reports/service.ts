/**
 * The three report reads — R28, R29, R30 (REQ-F-022, REQ-F-032, REQ-F-033).
 *
 * Every operation here is a read. There is no write, no transaction and no clock
 * beyond the one the window was resolved against; nothing in this module can
 * change the state it reports on. That is what makes the reports different from
 * the rest of the admin surface: they are answers about data other operations
 * wrote, and the only rules they add are about what counts.
 *
 * **What counts, and why (the gate's Q2–Q4).**
 *
 *   - Revenue is the sum of payments whose `status` is `paid`, in the window by
 *     `recordedAt`. An `unpaid` row is money owed, not money received; counting
 *     it would make the report disagree with the till. The breakdown reads the
 *     same rows, so the parts add up to the total by construction.
 *   - Popular services count every appointment in the window by `startAt`,
 *     whatever its status: REQ-F-032 names no status, and a cancelled
 *     appointment is still an appointment that was booked. The name is the
 *     current one from `services` (Q4) — the row is a ranking of a service.
 *   - Stock levels are a snapshot of `materials.stockQuantity`, the balance the
 *     ledger maintains (REQ-F-020). Inactive materials are listed too (R3): the
 *     question the report answers is "what is on the shelf", not "what can be
 *     booked".
 *
 * **Ordering is part of the answer.** The ranking's order is the report's whole
 * content, so it is fixed here — `bookingsCount DESC, name ASC` (D16), with
 * `serviceId` as the last key so two identically named services still have one
 * order. The stock list is in name order for the same reason.
 *
 * Source: REQ-F-022, REQ-F-032, REQ-F-033; D16; REQ-F-020 (the balance the
 *         stock report reads).
 * Contract: openapi.yaml#/components/schemas/RevenueReport,
 *           PopularServicesReport, StockLevelsReport.
 * Ticket: SMS-35 (Feature)
 */

import { and, asc, count, desc, eq, gte, lt, sum } from 'drizzle-orm';

import { getDb } from '../../db/client.js';
import {
  appointmentServices,
  appointments,
  materials,
  payments,
  services,
} from '../../db/schema.js';
import { salonDateTime } from '../../lib/occupancy.js';
import type { ResolvedPeriod } from './period.js';

/** The contract's method order for `byMethod` (R2): cash, then card. */
const METHOD_ORDER = ['cash', 'card'] as const;

/** `RevenueReport` as the contract declares it. */
export interface RevenueReportView {
  readonly period: string;
  readonly from: string;
  readonly to: string;
  readonly totalAmount: { readonly amountMinor: number; readonly currency: string };
  readonly paymentsCount: number;
  readonly byMethod: ReadonlyArray<{
    readonly method: string;
    readonly amount: { readonly amountMinor: number; readonly currency: string };
    readonly count: number;
  }>;
}

/**
 * R28 — the revenue of a window (REQ-F-022, Q2).
 *
 * The aggregate and the total come from one query each over the same predicate,
 * so `totalAmount` is the sum of `byMethod`'s amounts even though the rows are
 * read separately. `UAH` is the only currency `Money` admits, so the sum is in
 * one currency by construction (the gate's §1.2).
 */
export async function revenueReport(period: ResolvedPeriod): Promise<RevenueReportView> {
  const db = getDb();

  const rows = await db
    .select({
      method: payments.method,
      count: count(),
      amountMinor: sum(payments.amountMinor).mapWith(Number),
    })
    .from(payments)
    .where(
      and(
        eq(payments.status, 'paid'),
        gte(payments.recordedAt, period.start),
        lt(payments.recordedAt, period.end),
      ),
    )
    .groupBy(payments.method);

  const byMethod = METHOD_ORDER.flatMap((method) => {
    const row = rows.find((candidate) => candidate.method === method);
    if (row === undefined) return [];
    return [
      {
        method,
        amount: { amountMinor: row.amountMinor ?? 0, currency: 'UAH' },
        count: Number(row.count),
      },
    ];
  });

  const totalAmountMinor = byMethod.reduce((total, item) => total + item.amount.amountMinor, 0);
  const paymentsCount = byMethod.reduce((total, item) => total + item.count, 0);

  return {
    period: period.period,
    from: period.from,
    to: period.to,
    totalAmount: { amountMinor: totalAmountMinor, currency: 'UAH' },
    paymentsCount,
    byMethod,
  };
}

/** `PopularServicesReport` as the contract declares it. */
export interface PopularServicesReportView {
  readonly period: string;
  readonly from: string;
  readonly to: string;
  readonly items: ReadonlyArray<{
    readonly rank: number;
    readonly serviceId: string;
    readonly name: string;
    readonly bookingsCount: number;
  }>;
}

/**
 * R29 — the services booked most often in a window (REQ-F-032, D16, Q3, Q4).
 *
 * One row per service that was booked at least once in the window; a service
 * with no bookings is absent rather than a zero, because "booked zero times" is
 * not a ranking. The line's `service_id` is the snapshot's (REQ-NF-005 keeps it
 * stable across re-links), while the name is the catalogue's current one (Q4).
 */
export async function popularServicesReport(
  period: ResolvedPeriod,
): Promise<PopularServicesReportView> {
  const db = getDb();

  const rows = await db
    .select({
      serviceId: appointmentServices.serviceId,
      name: services.name,
      bookingsCount: count(),
    })
    .from(appointmentServices)
    .innerJoin(appointments, eq(appointments.id, appointmentServices.appointmentId))
    .innerJoin(services, eq(services.id, appointmentServices.serviceId))
    .where(and(gte(appointments.startAt, period.start), lt(appointments.startAt, period.end)))
    .groupBy(appointmentServices.serviceId, services.name)
    .orderBy(desc(count()), asc(services.name), asc(appointmentServices.serviceId));

  return {
    period: period.period,
    from: period.from,
    to: period.to,
    items: rows.map((row, index) => ({
      rank: index + 1,
      serviceId: row.serviceId,
      name: row.name,
      bookingsCount: Number(row.bookingsCount),
    })),
  };
}

/** `StockLevelsReport` as the contract declares it. */
export interface StockLevelsReportView {
  readonly asOf: string;
  readonly items: ReadonlyArray<{
    readonly materialId: string;
    readonly name: string;
    readonly unit: string;
    readonly quantity: number;
  }>;
}

/**
 * R30 — every material's current level (REQ-F-033, R3).
 *
 * `asOf` is the request's clock, not the database's: the snapshot is taken at
 * the instant the answer is built. `stockQuantity` is a `double precision`
 * column, so a value such as `160` must not reach the body as `"160"`; the
 * number is passed through unchanged because the driver already returns one for
 * that type.
 */
export async function stockLevelsReport(now: Date): Promise<StockLevelsReportView> {
  const db = getDb();

  const rows = await db
    .select({
      materialId: materials.id,
      name: materials.name,
      unit: materials.unit,
      quantity: materials.stockQuantity,
    })
    .from(materials)
    .orderBy(asc(materials.name), asc(materials.id));

  return {
    asOf: salonDateTime(now),
    items: rows.map((row) => ({
      materialId: row.materialId,
      name: row.name,
      unit: row.unit,
      quantity: row.quantity,
    })),
  };
}
