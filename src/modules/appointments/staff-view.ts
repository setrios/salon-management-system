/**
 * The staff representation of an appointment — `AppointmentAdmin`.
 *
 * The contract has two views of the same record. `Appointment` (the client's)
 * carries `accessToken` and `confirmationUrl`, because the client's credential
 * *is* the token (REQ-NF-001). `AppointmentAdmin` is the same record without
 * them: a master or the administrator may see the client's name and phone —
 * they need them to deliver the service — but not the credential that lets
 * anyone read the record without authenticating (D18, REQ-NF-006).
 *
 * The exclusion is written as a subtraction from `appointmentBody` rather than
 * as a second literal, so the two views cannot drift: a field added to the
 * client view appears in the staff view unless it is named here, and the two
 * names below are the whole of the difference.
 *
 * Source: REQ-F-013 (a master's calendar), REQ-NF-006 (the token is not
 *         disclosed to staff), D18;
 *         `openapi.yaml` AppointmentAdmin ("Excludes the client access token and
 *         confirmation URL").
 * Contract: openapi.yaml#/components/schemas/AppointmentAdmin.
 * Ticket: SMS-31 (Feature)
 */

import { appointmentBody, type AppointmentRecord } from './view.js';

/** One appointment in staff representation. */
export function staffBody(record: AppointmentRecord): Record<string, unknown> {
  const body = appointmentBody(record);
  delete body.accessToken;
  delete body.confirmationUrl;
  return body;
}
