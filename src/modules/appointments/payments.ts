/**
 * Appointment payments — administrator operation R27, the money recorded for a
 * completed appointment (REQ-F-021, REQ-F-027, D12).
 *
 *   R27 POST /admin/appointments/{appointmentId}/payments → 201 Payment
 *
 * The rule this module serves is two sentences of the SRS: the administrator
 * records the payment only after the service has been completed, and an
 * appointment carries at most one payment, immutable (D12).
 *
 * **The operation writes nothing else.** Recording the money does not move the
 * appointment's `status`, `updatedAt` or any other column (N6): the payment is
 * its own row, and the record stays what the service did. The staff
 * representation then carries `payment` because the view reads the row (N2).
 *
 * **The two refusals are 409s and they are different codes.** A record that is
 * not `completed` answers `APPOINTMENT_NOT_COMPLETED` with
 * `error-model.md` §5.5's sentence; a second payment on a completed record
 * answers `PAYMENT_ALREADY_RECORDED`. The order between them is the state before
 * the cardinality (N5), and the service decides both — this file maps them.
 *
 * **No `Location`** (N3): no operation reads a single payment, so a header would
 * name a URI that cannot be fetched. The contract declares the header, not its
 * presence, and R26 set the same precedent (M5).
 *
 * **`422 BUSINESS_RULE_VIOLATION` is declared for R27 and unreachable.** The
 * body's mistakes are `422 VALIDATION_ERROR` (D22), the state rule and the
 * cardinality are 409s, and REQ-F-021 states no amount rule (N1). It is recorded
 * in the gate rather than invented here.
 *
 * Source: REQ-F-021, REQ-F-027, REQ-NF-009, D12; `error-model.md` §3 (the two
 *         409 codes) and §5.5 (the not-completed body); `resource-model.md` §5.5
 *         (R27); `openapi.yaml` Payment, PaymentCreate, Money.
 * Contract: openapi.yaml#/paths/~1admin~1appointments~1{appointmentId}~1payments
 *           and #/components/schemas/Payment, PaymentCreate, Money.
 * Ticket: SMS-34 (Feature)
 *
 * Decisions (S5.3 inventory): N1–N8 as defined in
 * `logs/gates/2026-11-13-test-SMS-34.md` §1.1.
 */

import { Router, type Request, type Response } from 'express';

import { adminAccess } from '../../middleware/authorize.js';
import { HttpProblem } from '../../middleware/error-handler.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { asyncRoute, sendJson } from '../reference-data/http.js';
import { recordPayment } from './service.js';
import { paymentBody } from './view.js';
import { nowOf } from '../../lib/clock.js';
import { appointmentNotFoundForId } from './lookup.js';

/** `PaymentCreate` as the contract declares it. */
interface PaymentBody {
  readonly amount: { readonly amountMinor: number; readonly currency: string };
  readonly method: 'cash' | 'card';
  readonly status?: 'paid' | 'unpaid';
}

/** R27 — record the payment of a completed appointment. */
async function createPaymentHandler(req: Request, res: Response): Promise<void> {
  const { appointmentId } = res.locals.params as { appointmentId: string };
  const body = res.locals.body as PaymentBody;
  const now = nowOf(req);

  const result = await recordPayment(
    appointmentId,
    {
      amountMinor: body.amount.amountMinor,
      currency: body.amount.currency,
      method: body.method,
      // N4: `PaymentCreate.status` defaults to `paid`.
      status: body.status ?? 'paid',
    },
    now,
  );

  if (result.kind === 'not-found') {
    throw appointmentNotFoundForId();
  }
  if (result.kind === 'not-completed') {
    // error-model.md §5.5's sentence.
    throw new HttpProblem(
      'APPOINTMENT_NOT_COMPLETED',
      'A payment can be recorded only for a completed appointment.',
    );
  }
  if (result.kind === 'already-recorded') {
    throw new HttpProblem(
      'PAYMENT_ALREADY_RECORDED',
      'An appointment carries at most one payment.',
    );
  }

  // N3: no Location — see the header.
  sendJson(res, 201, 'Payment', paymentBody(result.payment));
}

/** Registers R27 on the admin router. */
export function paymentRoutes(router: Router): void {
  router.post(
    '/admin/appointments/:appointmentId/payments',
    ...adminAccess,
    validateParams('createPayment'),
    validateBody('createPayment'),
    asyncRoute(createPaymentHandler),
  );
}
