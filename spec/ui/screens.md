# UI screen specification

| | |
|---|---|
| Ticket | SMS-55 (stage S6) |
| Status | **Approved at UI-GATE (SMS-56), 2026-11-26** |
| Requirements | SRS v1.3 §User Interface; REQ-F-001…034; REQ-NF-001…004, 006, 007 |
| Contract | `spec/api/openapi.yaml` (API-GATE GO, 2026-10-26) — **unchanged by this document** |
| Decisions | lab 6 plan D-L6-1…D-L6-4; open decisions for the gate in §9 |
| Date | 2026-11-26 |

The interface is one more client of the approved contract. Every screen below
is derived from a requirement and calls only operations that already exist;
no screen adds behaviour the SRS does not state. Where a requirement has no
interface (it is a rule the server enforces), §7 says so instead of inventing a
screen for it.

---

## 1. What the SRS asks of the interface

| Source | Statement |
|---|---|
| SRS §User Interface | "Client-facing interface: a responsive website (REQ-NF-002), English (REQ-NF-003), no login. Master and Administrator interfaces: a web dashboard behind login (REQ-F-012, REQ-F-017)." |
| REQ-NF-002 AC | on a mobile-width viewport, the service/master/slot selection form, the confirmation page, and the cancel/reschedule actions are each fully usable without horizontal scrolling |
| REQ-NF-003 AC | no interface text, label or message is displayed in another language |
| REQ-NF-004 AC | all price and payment fields render with a UAH indicator |
| REQ-NF-006 AC | a client's name and phone are visible only to the master viewing their own appointments, the administrator, and the client through their own token |
| REQ-NF-007 AC | no location-selection or time-zone-selection control exists in the interface |
| Glossary, *Confirmation Page* | shown right after booking and reachable again by the SMS link; after cancellation it stays valid, shows status cancelled, and the cancel/reschedule controls are disabled |

## 2. Architecture constraints (D-L6-2)

| # | Constraint |
|---|---|
| 2.1 | Static pages served by the same Express process; the API stays under `/api/v1`, the interface takes the paths of §3. No server-side rendering, no new runtime dependency. |
| 2.2 | Browser code is TypeScript without a framework, compiled by the project's `tsc` (a separate project, `src/web/tsconfig.json` as built — the draft said `tsconfig.web.json`; corrected at SMS-64 — because the browser needs the DOM library and the server must not have it). |
| 2.3 | The interface calls the API only through `fetch` to `/api/v1/…` and renders the contract's own fields; it computes nothing the server already answers, except what C1 needs before a booking exists: the preview sums (C1-1 duration, C1-3 price) and the union of several masters' free slots (C1-2). After booking, the totals shown are the server's (`totalDurationMinutes`, `totalPrice`). |
| 2.4 | An API error is shown from the RFC 9457 `Problem` (`title`, `detail`, `errors[]` for field messages), never as a raw status code. |
| 2.5 | No paths other than those in §3 are served as pages; an unknown path still answers the API's 404 `Problem`. |
| 2.6 | On the administrator's reference-data screens (A4–A7), 409 `DUPLICATE_RESOURCE` is shown next to the field that must be unique (username, master–service pair, material name). |

## 3. Routes

| Path | Screen | Audience | Login |
|---|---|---|---|
| `/` | C1 Book an appointment | client | no |
| `/appointments/{token}` | C2 Your appointment (the Confirmation Page) | client | no — the token is the key (REQ-NF-001) |
| `/appointments/{token}/reschedule` | C3 Reschedule | client | no |
| `/staff/login` | S1 Sign in | master, administrator | — |
| `/staff/` | redirect to the role's first screen | master, administrator | yes |
| `/staff/me/calendar` | M1 My calendar | master | yes |
| `/staff/me/services` | M2 My services | master | yes |
| `/staff/me/availability` | M3 My availability | master | yes |
| `/staff/notifications` | N1 Notifications | master, administrator | yes |
| `/staff/notification-settings` | N2 Notification settings | master, administrator | yes |
| `/staff/admin/appointments` | A1 Appointments | administrator | yes |
| `/staff/admin/appointments/new` | A2 New appointment | administrator | yes |
| `/staff/admin/appointments/{id}` | A3 Appointment details | administrator | yes |
| `/staff/admin/masters` | A4 Masters | administrator | yes |
| `/staff/admin/services` | A5 Services | administrator | yes |
| `/staff/admin/master-services` | A6 Prices (master ↔ service links) | administrator | yes |
| `/staff/admin/materials` | A7 Materials | administrator | yes |
| `/staff/admin/materials/{id}` | A8 Material and its transactions | administrator | yes |
| `/staff/admin/reports` | A9 Reports | administrator | yes |

The staff paths mirror the contract's audiences (`/me` for the signed-in
person, `/admin` for the administrator), so a screen's path says whose data it
shows.

## 4. Client screens (no login, responsive — REQ-NF-002)

### 4.1 C1 — Book an appointment (`/`)

| | |
|---|---|
| Requirements | REQ-F-001, 002, 003, 004, 031; REQ-NF-002, 003, 004, 007, 008 |
| Operations | P1 `listServices`, P4 `listMasters`, P6 `listMasterServices`, P7 `getMasterAvailability`, P8 `createAppointment` |
| Scenarios | SCN-01, SCN-13 |

One page, four steps in the order the developer chose at UI-GATE (U-2):
services, then time, then master, then details. A later step is enabled only
when the earlier ones are complete, and changing an earlier step clears the
later ones.

An *eligible master* is an active master (P4 `active=true`) whose active links
(P6 `active=true`) cover **every** selected service. Availability is a
per-master operation in the contract (P7 needs `masterId`), so the time step
asks P7 once per eligible master and shows the union of their free slots.

| Step | Heading | Elements | Data |
|---|---|---|---|
| C1-1 | **Choose services** | a checkbox per service that at least one active master offers: name and duration ("45 min"), grouped by category; below them **Total duration** | P1 `active=true` joined with the P6 links of the P4 masters; **Total duration** is the sum of the ticked services' base durations (REQ-F-001) |
| C1-2 | **Choose a date and time** | a date field; then one button per slot (`10:00`, `10:30`, …) | P7 `date`, `serviceIds`, once per eligible master; a slot is shown when it is `available: true` for at least one of them (REQ-F-002); starts are on 30-minute boundaries because the server answers only those (REQ-F-031, REQ-NF-008) |
| C1-3 | **Choose a master** | one choice per eligible master who is free at the chosen slot: full name and that master's **Total price** ("900.00 UAH") | the master's P6 prices summed over the ticked services (REQ-F-001); a master not free at the slot is not listed |
| C1-4 | **Your details** | **Name**, **Phone** (`+380…`), button **Book**; above the button the summary **Total duration** and **Total price** | P8 body `client`, `masterId`, `serviceIds`, `startAt` |

| Case | Shown |
|---|---|
| no eligible master for the ticked services | at C1-1: **No master offers all of these services together. Remove a service to continue.**; C1-2 stays disabled |
| no free slot on the chosen date | at C1-2: **No free time on this date. Please choose another date.** |

Outcomes of **Book**:

| Answer | Shown |
|---|---|
| 201 | navigate to C2 at the path of `confirmationUrl`, with the banner **Your appointment is confirmed.** (REQ-F-003, REQ-F-004) |
| 409 `SLOT_UNAVAILABLE` | **This time is no longer available. Please choose another time.**; the slots of C1-2 are reloaded and C1-3 is cleared |
| 422 `VALIDATION_ERROR` | each `errors[]` item next to its field (`client.phone` → Phone) |
| any other | the Problem's `title` and `detail` in an error box |

No time-zone or location control exists; times are the salon's wall clock as
the API writes them (REQ-NF-007).

### 4.2 C2 — Your appointment (`/appointments/{token}`)

| | |
|---|---|
| Requirements | REQ-F-004, 005, 006; REQ-NF-001, 002, 003, 004, 006; glossary *Confirmation Page* |
| Operations | P9 `getAppointmentByToken`, P10 `cancelAppointmentByToken` |
| Scenarios | SCN-01, SCN-02 |

| Element | Content |
|---|---|
| **Status** | `Confirmed` / `Completed` / `Cancelled` from `status` |
| **When** | date and start–end time (`Mon 16 Nov 2026, 10:00–11:30`) |
| **Master** | `master.fullName` |
| **Services** | one line per service: name and price in UAH |
| **Total duration**, **Total price** | `totalDurationMinutes`, `totalPrice` in UAH |
| **Your details** | `client.name`, `client.phone` — this page is the client's own token (REQ-NF-006) |
| button **Reschedule** | opens C3 |
| button **Cancel appointment** | asks **Cancel this appointment? It is free of charge.** with **Yes, cancel** / **Keep it**; **Yes, cancel** calls P10 |

| State | Behaviour |
|---|---|
| `confirmed` | both buttons enabled |
| `cancelled` | the page still opens (the link stays valid); both buttons **disabled**, with **This appointment was cancelled.** |
| `completed` | both buttons disabled, with **This appointment has taken place.** |
| P9 404 | **We could not find this appointment. Check the link from your SMS.** |
| P10 200 | the page re-renders in the `cancelled` state, banner **Your appointment is cancelled.** |

### 4.3 C3 — Reschedule (`/appointments/{token}/reschedule`)

| | |
|---|---|
| Requirements | REQ-F-007, 008, 009, 029; REQ-NF-002, 008 |
| Operations | P9, P4, P6, P7, P11 `rescheduleAppointmentByToken` |
| Scenarios | SCN-03, SCN-11 |

| Element | Content |
|---|---|
| **Current time** | the appointment's date, time and master (P9) |
| **New date** and slot buttons | P7 for the appointment's `serviceIds`, once per eligible master (as C1), union of the free slots — the same order as C1: time before master (U-2) |
| **Master** | the eligible masters free at the chosen slot, the current master first and preselected when free |
| button **Confirm new time** | P11 with `startAt` (and `masterId` when changed) |
| link **Back to my appointment** | C2 |

| Answer | Shown |
|---|---|
| 200 | C2, banner **Your appointment has been rescheduled.** |
| 409 `SLOT_UNAVAILABLE` | the C1 409 message; slots reloaded |
| 409 `INVALID_STATE_TRANSITION` (cancelled or completed, `error-model.md` §3.1) | **This appointment can no longer be changed.** and a link to C2 |

Rescheduling has no limit on count or notice (REQ-F-007): the page offers no
counter and no deadline.

## 5. Staff screens (login — REQ-F-012, REQ-F-017)

### 5.1 Common to both roles

| Screen | Requirements | Operations | Elements and behaviour |
|---|---|---|---|
| **S1 Sign in** `/staff/login` | REQ-F-012, 017 | A1 `login`, A2 `getCurrentPrincipal` | **Username**, **Password**, button **Sign in**. 200 → A2 → the role's first screen (`master` → M1, `admin` → A1). 401 → **Wrong username or password.** No sign-up and no password reset link: accounts are created by the administrator (REQ-F-012), reset is out of scope (glossary). |
| **Header** (every staff screen) | — | A2 | the signed-in person's `displayName`, the role's menu (§5.2 / §5.3), button **Sign out** (forgets the token; the contract has no logout operation) |
| **Session end** | — | any | a `401` from any call → S1 with **Your session has ended. Please sign in again.** |
| **N1 Notifications** `/staff/notifications` | REQ-F-016, 023, 030 | M7 `listMyNotifications` | table: **Created**, **Event** (New / Reschedule / Cancellation / 24h reminder / 2h reminder), **Channel** (SMS / In-app), **Status**, **Appointment**; filters **Status**, **Event**, **From**, **To** |
| **N2 Notification settings** `/staff/notification-settings` | REQ-F-016, 023, 026 | M5, M6 | a grid: rows New / Reschedule / Cancellation × columns SMS / In-app, one switch per cell. Changing one switch sends one M6 for that cell only (REQ-F-026) and shows **Saved.** |

### 5.2 Master (menu: My calendar · My services · My availability · Notifications · Notification settings)

| Screen | Requirements | Operations | Elements and behaviour |
|---|---|---|---|
| **M1 My calendar** `/staff/me/calendar` | REQ-F-013; REQ-NF-006 | M1 `listMyAppointments` | **From** / **To** (default: the current week), a list grouped by day: time, client name and phone, services, status. Only the master's own appointments exist in the answer (REQ-F-013). |
| **M2 My services** `/staff/me/services` | REQ-F-014; REQ-NF-004 | M2 `listMyServices` | table **Service**, **Category**, **Duration**, **Price** (UAH). Read-only: prices are set by the administrator (REQ-F-018). |
| **M3 My availability** `/staff/me/availability` | REQ-F-015 | M3, M4 | **Weekly hours**: rows of **Day**, **From**, **To**, with **Add** / **Remove**. **Specific dates**: rows of **Date**, **From**, **To**, with **Add** / **Remove**. Button **Save** sends the whole set with M4 (replace). 422 → field messages. |

### 5.3 Administrator (menu: Appointments · Masters · Services · Prices · Materials · Reports · Notifications · Notification settings)

| Screen | Requirements | Operations | Elements and behaviour |
|---|---|---|---|
| **A1 Appointments** `/staff/admin/appointments` | REQ-F-019 | R18 | filters **From**, **To**, **Master**, **Status**; table **When**, **Client**, **Master**, **Services**, **Total**, **Status**; row → A3; button **New appointment** → A2 |
| **A2 New appointment** `/staff/admin/appointments/new` | REQ-F-019, 001, 002, 003, 030, 031 | P1, P4, P6, P7, R19 | the four steps of C1 in the same order (services → time → master → client details), with **Create appointment** instead of **Book**; 201 → A3. Same 409 / 422 handling. |
| **A3 Appointment details** `/staff/admin/appointments/{id}` | REQ-F-019, 021, 027, 028, 030; REQ-F-008, 010, 011, 029 (reminders shown) | R20, R21, R22, R23, R27, R24, P7 | details as C2 plus **Reminders** (24h / 2h, time, status) and **Payment**. Actions: **Change** (date, time, master, services or client — R21, slots from P7), **Cancel appointment** (R22, with a confirmation step), **Mark as completed** (R23), **Record payment** (R27: **Amount** in UAH, **Method** cash / card, **Status** paid / unpaid). **Record payment** is disabled until the status is completed (REQ-F-021, REQ-F-027); after a payment exists it is shown, not editable. Section **Notifications** lists R24. |
| **A4 Masters** `/staff/admin/masters` | REQ-F-012, 018 | R1, R2, R3, R4 | table **Name**, **Username**, **Active**; **Add master** (**Full name**, **Username**, **Password**); **Edit** (full name only — `MasterPatch` has no username or password) and **Deactivate** / **Activate**. 409 `DUPLICATE_RESOURCE` → **This username is already taken.** No delete (REQ-F-018, REQ-NF-005). |
| **A5 Services** `/staff/admin/services` | REQ-F-018, 024 | R5, R6, R7, R8, R9 | table **Name**, **Category**, **Duration**, **Active**; **Add service** with **Category** as a text field offering the existing categories (R9, the three seeds included) **and accepting a new one** (REQ-F-024); **Edit**, **Deactivate** / **Activate**. |
| **A6 Prices** `/staff/admin/master-services` | REQ-F-014, 018 | R10, R11, R12, R1, R5 | table **Master**, **Service**, **Price** (UAH), **Active**; **Add price** (master, service, price); **Edit price**, **Deactivate** / **Activate**. |
| **A7 Materials** `/staff/admin/materials` | REQ-F-018, 025, 020 | R13, R14, R16, R17 | table **Name**, **Unit**, **In stock**, **Active**; **Add material** (**Name**, **Unit**, **Initial stock**) with **Unit** offering the standard list (R17: ml, l, g, kg, pcs) **and accepting a custom unit** (REQ-F-025); **Edit**, **Deactivate** / **Activate**; row → A8. |
| **A8 Material** `/staff/admin/materials/{id}` | REQ-F-020 | R15, R25, R26 | the material and its stock; **Transactions** table (**Date**, **Type** receipt / issue, **Quantity**, **Note**); **Add transaction** (R26). 409 `MATERIAL_STOCK_INSUFFICIENT` → **Not enough stock for this issue.** |
| **A9 Reports** `/staff/admin/reports` | REQ-F-022, 032, 033; REQ-NF-004 | R28, R29, R30 | three tabs. **Revenue**: **Period** Day / Week / Month **or** **From** / **To** (one form at a time — REQ-F-022), then **Total**, **Payments**, **By method**. **Popular services**: the same period control, then the ranked table. **Stock levels**: the snapshot table, no period (REQ-F-033). 422 `INVALID_PERIOD` → its `detail`. |

## 6. Cross-cutting rules (REQ-NF)

| Rule | How the interface meets it | How the test checks it |
|---|---|---|
| REQ-NF-002 responsive | C1, C2, C3 lay out in one column under 600 px; no fixed widths | at a 375 × 812 viewport, `scrollWidth <= clientWidth` on C1 (every step), C2 and C3, and each of their controls is clickable |
| REQ-NF-003 English | every text of the interface is English and lives in the page or script, not composed from the server's data | no Cyrillic character in any rendered text of the screens visited by the tests, fixtures aside |
| REQ-NF-004 UAH | every `Money` is rendered by one formatter as `<amount with two decimals> UAH` | every rendered price and payment field ends with `UAH` |
| REQ-NF-006 privacy | client name and phone appear only on C2 (own token), M1 (own appointments), A1–A3; the browser stores no client data, and the staff token only in `sessionStorage` | the public screens other than C2 show no client data; a master's M1 shows no other master's appointment |
| REQ-NF-007 single zone | no time-zone or location control anywhere | no `select` / input labelled time zone or location exists on any screen |
| REQ-NF-001 token | the token appears only in C2/C3 paths; the interface never lists tokens | C2 for an unknown token shows the 404 message |

## 7. Requirements without a screen, and why

| Requirement | Reason |
|---|---|
| REQ-F-005, 009 (SMS recorded) | server-side records; visible to the administrator in A3 **Notifications** (R24), not to the client |
| REQ-F-008, 010, 011, 029 (reminder times and skip rules) | computed by the server; shown read-only in A3 **Reminders** |
| REQ-F-030 (no self-notification) | a server rule; observable in N1 as the absence of a row |
| REQ-F-031 (30-minute rounding) | the server answers only aligned slots; C1/C3 show what it answers |
| REQ-F-034 (cancelled reminders, addendum 001) | shown as status `cancelled` in A3 **Reminders** |
| REQ-NF-005, 009 | absence constraints: no delete control and no payment gateway exist in any screen |

## 8. Operations the interface does not call

| Operation | Reason |
|---|---|
| P2 `getService`, P3 `listCategories`, P5 `getMaster` | the list operations P1, P4 and R9 already carry what C1/C3/A5 show |

Every other operation of the 50 is called by at least one screen above.

## 9. Decisions for UI-GATE

| # | Question | Proposal | Why |
|---|---|---|---|
| U-1 | `confirmationUrl` points to `https://salon.example/…`, a placeholder, so the SMS link of REQ-F-005 is not "a valid link" and the contract's description "Reachable confirmation page" is not met. | Make the origin configurable (`PUBLIC_BASE_URL`, default `http://localhost:<PORT>`), path unchanged (`/appointments/{token}`). A defect fix, done **before** the UI tests as its own ticket (SMS-70): failing test, TEST-GATE, fix. The contract is unchanged — its schema says `format: uri`, the example host stays an example. | The confirmation page this document specifies must be the page the SMS points to. |
| U-2 | Order of the client's steps | **services → date and time → master → details** (decided by the developer at UI-GATE; the draft proposed master first) | The client starts from what they want done and when; the master is chosen among those free at that time. The price, which belongs to a master (MasterService), is shown at the master step, next to each master. |
| U-3 | Staff session | token in `sessionStorage`, gone when the tab closes; no refresh (the contract has none); a 401 returns to S1 | No client data and no long-lived credential in the browser (REQ-NF-006). |
| U-4 | Formats | money `1250.00 UAH`; date `Mon 16 Nov 2026`; time `10:00` (24-hour), the salon's wall clock, no zone label | English, UAH, one zone (REQ-NF-003, 004, 007). |
| U-5 | Where REQ-NF-002 is tested | the mobile viewport for C1–C3, which are the screens its acceptance criterion names; staff screens are tested at a desktop viewport | The AC lists client controls only; the staff dashboard is not required to be mobile-first. |
| U-6 | Test tool | Playwright (`@playwright/test`, Chromium) against the real server on the test database, as a separate `npm run test:ui` | REQ-NF-002 needs a real layout engine; HTTP tests cannot measure scrolling. |

## 10. Out of scope

Client accounts, password reset, a real SMS gateway (the SMS is a recorded row),
a payment gateway, an administrator screen for a master's availability (the
contract has none), languages other than English, offline use.

## 11. Control conventions (accepted at TEST-GATE SMS-57)

The specification above fixes labels and messages. The browser tests also
need a way to find a control; where §4–§5 were silent, the conventions below
were proposed by the tests and accepted by the developer at TEST-GATE SMS-57
(`logs/gates/2026-11-26-test-SMS-57.md`, GO). They are part of this
specification from that gate on, so the implementation (SMS-36) and the user
guide (SMS-63) follow them.

| # | Convention | What it settles |
|---|---|---|
| K1 | Each step of C1 (and of A2) is a **region** named by its heading: *Choose services*, *Choose a date and time*, *Choose a master*, *Your details*. M3's two parts are regions *Weekly hours* and *Specific dates*. A3's parts are regions *Reminders* and *Payment*. | "one page, four steps" |
| K2 | Every staff form is submitted with a button **Save** (Add master, Add service, Add price, Add material, Add transaction, Record payment, Change, My availability). | the forms' submit buttons are not named |
| K3 | Totals are rendered as one text each: `Total duration: 75 min`, `Total price: 900.00 UAH`; on A9 `Total: … UAH` and `Payments: n`; on A8 `In stock: 15 ml`. | "below them Total duration" |
| K4 | The date fields are labelled **Date** (C1, A2, A3 Change, A8), **New date** (C3), **From** / **To** (M1, A1, A9). | "a date field" |
| K5 | A notification-settings switch is a checkbox or switch whose accessible name is the event and the channel, e.g. `Reschedule SMS`; a change shows **Saved.** | "one switch per cell" |
| K6 | A master choice is a **radio** whose accessible name holds the full name and that master's total price. | "one choice per eligible master" |
| K7 | A 422 field error marks its input with `aria-invalid="true"`. | "each errors[] item next to its field" |
| K8 | The A4–A7 *Active* column reads **Yes** / **No**; the row's button reads **Deactivate** / **Activate**. | "Deactivate / Activate", column *Active* |
| K9 | A5's *Category* and A7's *Unit* are text inputs with a suggestion list (`<datalist>`), which is what "offering … and accepting a new one" means in HTML. | "a text field offering the existing categories" |
| K10 | A9 has tabs **Revenue**, **Popular services**, **Stock levels**; the period control is a select **Period** with Day / Week / Month / **Custom range**, then **From** / **To**, and a button **Show**. | "the same period control" **Amended at SMS-76 (the developer's review):** From / To are always enabled; typing a date selects *Custom range*, choosing Day / Week / Month empties the dates — still one form per request (REQ-F-022). |
| K11 | A transaction's *Type* is a select **Receipt** / **Issue**; a payment's *Method* **Cash** / **Card** and *Status* **Paid** / **Unpaid**. | the options' labels |
| K12 | A2's details step keeps the C1 fields **Name** and **Phone**; its region's name contains *details*. | "client details" |
| K13 | REQ-NF-002 is measured as: layout width equals the device width (a `device-width` viewport), and `scrollWidth ≤ clientWidth`, after every step of the mobile flows. The first half was added after the red run showed a page without a viewport meta laid out at 980 px — never scrolling, never usable. | "usable without horizontal scrolling" |
