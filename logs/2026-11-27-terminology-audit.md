# Terminology audit — glossary ↔ contract ↔ code ↔ interface ↔ tests (SMS-59)

| | |
|---|---|
| Ticket | SMS-59 (lab 6, step 3) |
| Glossary | SRS v1.3 §Domain Glossary (`spec/salon-management-system-srs-v1.3.tex`, lines 331–415) |
| Rule | `docs/coding-convention.md` §4.1 (domain names come from the glossary), §4.2 (contract names are fixed) |
| Head | `f82aa2b` |
| Date | 2026-11-27 |

Lab 6 step 3 asks that the names of entities, methods, commands and key code
elements match the glossary, and that a terminology fix respect the tests and
the API so that behaviour does not change unnoticed. The audit therefore looks
for two things: a glossary term spelled differently in some layer, and a
synonym the glossary does not define standing in for one of its terms.

---

## 1. Method

1. **Synonym scan** over `src/` (server), `src/web/` (interface), `tests/`,
   `spec/api/openapi.yaml` and the documentation, for words that would replace
   a glossary term: *customer*, *stylist*, *employee*, *worker*, *reservation*,
   *visit*, *order*, *product*, *inventory*, *booking*, *catalog(ue)*, *fee*,
   *schedule*, *slot*. Every hit was opened and read in context.
2. **Term-by-term table** (§2): for each glossary term, the name it has in the
   contract, the database, the server code, the interface and the tests.
3. **Definitions against the contract**: each glossary definition compared
   with the enums and fields the contract gives the same term.

## 2. Glossary term → every layer

| Glossary term | Contract (`openapi.yaml`) | Database | Server code | Interface label | Tests |
|---|---|---|---|---|---|
| Client | `Client` (`name`, `phone`), `Appointment.client` | `appointments.client_name`, `client_phone` | `client` | C1 **Your details**; A2 **Client details**; A3 **Client**; M1 rows | `client` |
| Master | `Master`, `MasterPublic`, `/masters`, `/admin/masters`, `masterId` | `masters` (`role = 'master'`) | `masters/`, `findMaster`, `BookableMaster` | **Choose a master**, A4 **Masters**, **Add master** | `arrangeMaster`, `createMaster` |
| Administrator | role `admin` (`Principal.role`), `/admin/*` | `masters` (`role = 'admin'`, D-19) | `adminAccess`, `role: 'admin'` | menu of the administrator; A3 notifications **To: Administrator** | `arrangeAdmin`, `signInAdmin` |
| Service | `Service`, `/services`, `serviceIds` | `services` | `catalog/` (`ServiceView`, `listServices`) | **Choose services**, A5 **Services**, **Add service** | `createService` |
| MasterService | `MasterService`, `/admin/master-services` | `master_services` | `master-services/`, `createLink`, `Link` | A6 **Prices**, **Add price**, **Edit price** | `linkService`, `arrangeLink` |
| Appointment | `Appointment`, `AppointmentAdmin`, `/appointments`, `/admin/appointments` | `appointments` | `appointments/`, `bookAppointment` | **Your appointment**, A1 **Appointments**, **New appointment**, **Appointment details** | `book`, `Booked` |
| AppointmentService | `AppointmentService` (`Appointment.services[]`) | `appointment_services` | `appointmentServices` | the **Services** lines of C2 / A3 | `services[]` |
| Confirmation Page | `Appointment.confirmationUrl` ("Reachable confirmation page") | — | `confirmationUrlOf` (`view.ts`) | C2 **Your appointment** at `/appointments/{token}` | `confirmation.test.ts`, `confirmation.spec.ts` |
| Payment | `Payment`, `PaymentCreate`, `/payments` | `payments` | `payments.ts` | A3 **Payment**, **Record payment** | `appointment-payments.test.ts` |
| Material | `Material`, `/admin/materials`, `UnitList` | `materials` | `materials/` | A7 **Materials**, **Add material**, **In stock** | `createMaterial` |
| MaterialTransaction | `MaterialTransaction`, `/transactions` | `material_transactions` | `transactions.ts` | A8 **Transactions**, **Add transaction** (**Receipt** / **Issue**) | `material-transactions.test.ts` |
| Notification | `Notification`, `/me/notifications`, `/notifications` | `notifications` | `notifications/` | N1 **Notifications**, A3 **Notifications** | `notification.test.ts` |
| Reminder | `Reminder` (`type` `24h` / `2h`), event `reminder_24h` / `reminder_2h` | rows of `notifications` (H1) | `reminders.ts`, `REMINDER_OFFSETS` | A3 **Reminders**; N1 **24h reminder** / **2h reminder** | `reminders.test.ts` |
| Notification Preference | `NotificationPreference`, `/me/notification-preferences` | `notification_preferences` | `preferences.ts` | N2 **Notification settings** | `notification-preferences.test.ts` |
| *(statuses)* confirmed / completed / cancelled | `Appointment.status` enum | `appointments.status` | `state.ts` | **Confirmed** / **Completed** / **Cancelled** | as the enum |

Terms used by the requirements without their own glossary row, checked the
same way: *slot* (REQ-F-002, `AvailabilitySlot`, slot buttons), *weekly
pattern* / *specific dates* (REQ-F-015, `WeeklyRule` / `DateRule`, M3 **Weekly
hours** / **Specific dates**), *category* (REQ-F-024, `Category`), *unit of
measure* (REQ-F-025, `unit`, A7 **Unit**). All consistent.

## 3. Synonym scan — what the hits were

| Word | Hits | Reading |
|---|---|---|
| customer, stylist, employee, staffer, reservation | 0 everywhere | — |
| worker | 2 (tests) | Vitest "workers", not a person |
| visit | 3 (tests) | "a client visit" — the glossary's own definition of Appointment |
| fee | 5 (tests) | "without a fee" — REQ-F-006's wording |
| order | 77 (src) | `orderBy` and "in order"; not a domain noun |
| product | 7 (src) | all `production` (`NODE_ENV`) |
| inventory | 3 (src, comments) | "S5.x inventory" = the list of a gate's decisions, not stock |
| booking / bookable / booked | 106 (src) | the client's *action* ("books a service", glossary *Client*) and its adjectives (`BookableMaster`, `PendingBooking`, `bookedBlocks`). The entity is always `Appointment`; no identifier calls an appointment a booking |
| schedule | 80 (src) | the reminder scheduler and "scheduled" (a status); availability is always `availability` |
| catalog / catalogue | 16 / 4 (src), 2 / 2 (contract) | see T2 |

## 4. Findings

| # | Finding | Disposition |
|---|---|---|
| T1 | The glossary's *Notification* says "send status (sent/skipped/failed)". REQ-F-029 itself uses `scheduled`, and addendum 001 (REQ-F-034) added `cancelled`; the contract and the code carry all five. The glossary lags its own requirements. | **Clarification CL-13** in `spec/api/clarifications.md`: the set is the five statuses REQ-F-029 and REQ-F-034 already require. No behaviour change; the glossary row is corrected in the next SRS revision. |
| T2 | *catalog* / *catalogue*: the server module is `src/modules/catalog/` (`catalogRoutes`), while the contract's tag and most prose say "Public catalogue". Not a glossary term — a spelling difference between code (US) and prose (UK). | **Accepted, no rename.** Identifiers keep `catalog`; prose follows the contract's "catalogue". Renaming the directory would rewrite paths recorded in `tests/manifest.json` and break `check:test-first`'s proof for the files it names, for no change of meaning. Recorded in `docs/coding-convention.md` §4.1. |
| T3 | Four interface labels differ from the glossary term by design: **Prices** (MasterService), **Your appointment** (Confirmation Page), **Notification settings** (Notification Preference), **Transactions** (MaterialTransaction). | **Accepted** — fixed by `spec/ui/screens.md` (UI-GATE GO): a client reads "Your appointment", not "Confirmation Page". The user guide (SMS-63) names both, so a reader can go from either to the other. |
| T4 | `spec/addenda/001-cancelled-reminders.md` §impact says "migration 0009"; the migration is `0008_cancelled_reminders.sql` (README and `components.md` say 0000–0008, correctly). | Not terminology — a document that disagrees with the code. **Carried to SMS-64** (documentation against code). |
| T5 | R11's answer for a reference that names nothing was a decision made at a gate but absent from `error-model.md`. | **Clarification CL-14**, so the decision is found where error codes are looked up. |

## 5. The developer's decisions (2026-11-27)

| Finding | Decision |
|---|---|
| T1 | Clarification CL-13 accepted. Asked whether five statuses are too many: the code was checked — `scheduled`, `sent`, `skipped`, `cancelled` are each produced and mean different things (REQ-F-029 depends on `skipped` ≠ `cancelled`); `failed` is never produced because delivery is simulated. **Keep `failed` as reserved and document it** (option a), rather than removing it through an addendum (option b). The N1 Status filter keeps its "Failed" option. |
| T2 | No rename. |
| T3 | Keep the interface labels; the user guide gives both names at first mention. |
| T4 | Carried to SMS-64. |
| T5 | Clarification CL-14 accepted. |

Approved by setrios, 2026-11-27; recorded by the coding agent at the developer's instruction.

## 6. Result

No identifier in the server, the interface or the tests uses a term the
glossary does not define in place of one it does, and no glossary term is
spelled two ways across layers. Nothing was renamed: the audit found no
rename that would have been worth the risk lab 6 step 3 warns about, and the
two names that differ (T2, T3) differ for recorded reasons. The contract is
unchanged.

The one inconsistency of meaning (T1) is in the specification itself and is
resolved by clarification CL-13 rather than by editing the approved SRS.
