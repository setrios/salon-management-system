# User guide — Salon Management System

| | |
|---|---|
| Ticket | SMS-63 (lab 6, step 7) |
| For | clients who book; masters; the salon's administrator |
| Interface | `spec/ui/screens.md` — every label in **bold** below is the text on the screen |
| Installation | `README.md` (the administrator's first steps are in §5.1 here) |

The system has two parts in one website:

| Part | Address | Who | Sign-in |
|---|---|---|---|
| The client website | `http://<salon address>/` | anyone booking a visit | none |
| The staff dashboard | `http://<salon address>/staff/login` | masters and the administrator | username and password |

On a local installation the salon address is `localhost:3000`.

**Everywhere:** the interface is in English; times are the salon's own time
(Kyiv), written the way your browser writes times — `2:30 PM` or `14:30`;
amounts are in hryvnias —
`450.00 UAH`; dates are written `Mon 16 Nov 2026`. There is no time-zone or
location choice: the salon has one address and one clock.

---

## 1. Words used in this guide

The screens use everyday words; the specification (SRS) uses its glossary
terms. They name the same things:

| On the screen | In the specification |
|---|---|
| **Your appointment** (the client's page) | Confirmation Page |
| **Prices** | MasterService — a master's price for a service |
| **Notification settings** | Notification Preference |
| **Transactions** | MaterialTransaction |
| appointment, master, service, material, payment, reminder, notification | the same words |

An **appointment** is one visit: one master, one or more services, a start and
an end. A **master** performs services; the **administrator** runs the salon's
records. A client has no account: an appointment is reached by its own link.

---

## 2. Clients — book, reschedule, cancel

### 2.1 Book an appointment

Open the salon's website. The page **Book an appointment** has four steps, in
this order; a step opens when the one before it is complete.

1. **Choose services** — tick one or more services. Each shows its duration
   (`45 min`). Below them, **Total duration** adds up what you ticked.
   If you see *No master offers all of these services together. Remove a
   service to continue.*, no single master does all of them: untick one.
2. **Choose a date and time** — pick a **Date**. The free start times appear as
   buttons (`10:00`, `10:30`, …). Only times when some master can do all your
   services are shown. *No free time on this date. Please choose another date.*
   means just that.
3. **Choose a master** — the masters free at that time are listed, each with
   their **Total price** for your services (prices differ between masters).
4. **Your details** — your **Name** and **Phone** (for example `+380501234567`),
   then **Book**. The summary above the button shows the **Total duration**
   and **Total price** you are booking.

After **Book** you are on your appointment's page with *Your appointment is
confirmed.* There is no approval step: the time is yours.

| If you see | It means | What to do |
|---|---|---|
| *This time is no longer available. Please choose another time.* | someone booked that time while you were filling in the form | pick another time; the list is refreshed |
| a field outlined in red with a message under it | that field is not accepted (e.g. a phone with letters) | correct it and press **Book** again |

**Keep the page's address.** It is the link the salon's SMS would send you, and
the only way back to your appointment — there is no account to sign in to. In
this version the SMS is not actually sent (see §6), so bookmark the page or
copy its address.

### 2.2 Your appointment

The page **Your appointment** (`/appointments/…`) shows:

| Line | Content |
|---|---|
| **Status** | **Confirmed**, **Completed** or **Cancelled** |
| **When** | date, start and end, e.g. `Mon 16 Nov 2026, 10:00–11:30` |
| **Master** | who will do the services |
| **Services** | each service with its price |
| **Total duration**, **Total price** | the visit as a whole |
| **Your details** | the name and phone you gave |

and two buttons, **Reschedule** and **Cancel appointment**. After a
cancellation the page still opens, shows **Cancelled** and *This appointment
was cancelled.*, and both buttons are greyed out. After the visit it shows
**Completed** and *This appointment has taken place.*

*We could not find this appointment. Check the link from your SMS.* means the
address is not complete — copy the whole link.

### 2.3 Reschedule

**Reschedule** opens the page **Reschedule**. It shows your **Current time**.
Rescheduling is free, at any time before the visit, as many times as you like.

1. Pick a **New date**; the free times appear (the same rule as booking).
2. Pick a time. Under **Choose a master**, your current master is listed first
   and already selected if free; you may choose another.
3. **Confirm new time**. You are back on your appointment's page with *Your
   appointment has been rescheduled.*

*This appointment can no longer be changed.* — it was cancelled or has
taken place. **Back to my appointment** returns without changing anything.

### 2.4 Cancel

**Cancel appointment** asks *Cancel this appointment? It is free of charge.*
**Yes, cancel** cancels it (*Your appointment is cancelled.*); **Keep it**
changes nothing. Cancelling is free, at any time.

---

## 3. Staff — signing in

Open `/staff/login`, enter your **Username** and **Password**, press
**Sign in**. A master lands on **My calendar**, the administrator on
**Appointments**.

- *Wrong username or password.* — try again; accounts are created by the
  administrator (masters) or at installation (the administrator). There is no
  sign-up and no password reset in this version.
- **Sign out** (top of every staff page) ends the session on this device.
- *Your session has ended. Please sign in again.* — a session lasts one hour
  by default; sign in again.

The top of every staff page shows your name and your menu.

---

## 4. Masters

Menu: **My calendar** · **My services** · **My availability** ·
**Notifications** · **Notification settings**.

### 4.1 My calendar

Your appointments, grouped by day: time, the client's name and phone, the
services and the status. **From** and **To** choose the days shown (this week
when you open it). Only your own appointments are here.

### 4.2 My services

The services you perform, with **Category**, **Duration** and your **Price**.
Read-only: the administrator sets services and prices.

### 4.3 My availability — your working hours

Clients can book you only inside these hours.

- **Weekly hours** — one row per working day: **Day**, **From**, **To**
  (e.g. Monday, `09:00`, `18:00`). **Add** adds a row, **Remove** removes it.
  Two rows for the same day are two separate periods.
- **Specific dates** — one-off hours for a single **Date**, in the same way.

**From** and **To** are your browser's own time picker. Press **Save** when
done — nothing is stored before. *Saved.* confirms it. A row whose end is not
after its start is marked *The end time must be after the start time.*, and
a row left half-filled *Choose a time.*; nothing is saved until they are
corrected.

### 4.4 Notifications and Notification settings

**Notifications** lists what the system recorded for you: **Event** (**New**,
**Reschedule**, **Cancellation**, **24h reminder**, **2h reminder**),
**Channel** (**SMS** or **In-app**) and **Status**. The filters **Status**,
**Event**, **From**, **To** narrow the list.

**Notification settings** has one switch per event and channel — for example
"Reschedule SMS". Switching one changes only that one (*Saved.*). With every
switch of an event off, you are not notified of that event.

---

## 5. The administrator

Menu: **Appointments** · **Masters** · **Services** · **Prices** ·
**Materials** · **Reports** · **Notifications** · **Notification settings**.

Every form in the dashboard is sent with **Save**. A row is never deleted:
**Deactivate** takes it out of new bookings and lists of choices but keeps it
in the history; **Activate** brings it back.

### 5.1 First day: before clients can book

1. **Masters** → **Add master** — **Full name**, **Username**, **Password** for each
   master. Give each master their username and password.
2. **Services** → **Add service** — **Name**, **Category** (the field suggests Hair,
   Coloring, Barbering; you may type a new one), **Duration (min)**.
3. **Prices** → **Add price** — for each master and each service they perform:
   **Master**, **Service**, **Price (UAH)**. A service appears to clients only
   once some master has a price for it.
4. Each master signs in and sets **My availability** (§4.3). Without working
   hours, no time is offered.

### 5.2 Appointments

The list shows **When**, **Client**, **Master**, **Services**, **Total** and
**Status**, filtered by **From**, **To**, **Master** and **Status**. Click a row
to open it.

**New appointment** books for a client (e.g. on the phone): the same four
steps as the client's page (§2.1), with the client's **Name** and **Phone**
under **Client details**, then **Create appointment**.

### 5.3 Appointment details

The appointment, its **Reminders** (24h and 2h, with their time and status) and
its **Payment**, and the actions:

| Action | What it does |
|---|---|
| **Change** | a new **Date** and time (and master, if another is free), or only the client's **Name** / **Phone**; then **Save**. The client's reminders and the update SMS follow the new time, as for a client's reschedule |
| **Cancel appointment** | asks first (**Yes, cancel** / **Keep it**); the client's page shows Cancelled |
| **Mark as completed** | the visit has taken place; the status becomes **Completed** |
| **Record payment** | available only after **Mark as completed**: **Amount (UAH)**, **Method** (**Cash** / **Card**), **Status** (**Paid** / **Unpaid**), **Save**. One payment per appointment; it cannot be edited afterwards |

The **Notifications** section lists every message the appointment produced —
to the client, the master and the administrator. Your own actions do not
notify you; the master is still notified.

Reminder and notification statuses:

| Status | Meaning |
|---|---|
| Scheduled | will be sent at its time |
| Sent | handed to the channel |
| Skipped | its time had already passed when the appointment was booked or moved |
| Cancelled — not sent | the appointment was cancelled before its time |

(A fifth status, *failed*, is reserved for a real SMS service; it does not
occur in this version.)

### 5.4 Masters, Services, Prices

| Screen | Columns | Actions |
|---|---|---|
| **Masters** | **Name**, **Username**, **Active** | **Add master**; **Edit** (the full name); **Deactivate** / **Activate** |
| **Services** | **Name**, **Category**, **Duration**, **Active** | **Add service**; **Edit**; **Deactivate** / **Activate** |
| **Prices** | **Master**, **Service**, **Price**, **Active** | **Add price**; **Edit price**; **Deactivate** / **Activate** |

*This username is already taken.* and *This master already has a price for
this service.* name the field to change. A master's username and password
cannot be changed after creation in this version.

### 5.5 Materials

**Materials** lists the consumables with **Unit**, **In stock** and **Active**.
**Add material** asks **Name**, **Unit** (suggests ml, l, g, kg, pcs; you may
type another, e.g. `drops`) and **Initial stock**.

Click a material's name to open it: it shows *In stock: 15 ml* and its
**Transactions**. **Add transaction** records a **Type** — **Receipt** (stock
arrives) or **Issue** (stock is used) — with a **Quantity**, a **Date** and an
optional **Note**. *Not enough stock for this issue.* refuses an issue larger
than what is in stock.

### 5.6 Reports

Three tabs:

| Tab | Choose | Shows |
|---|---|---|
| **Revenue** | a **Period** — Day, Week, Month — or dates in **From** / **To** (typing a date selects *Custom range*), then **Show** | *Total:* the paid amount, *Payments:* their number, and a line per **Method** |
| **Popular services** | the same | services ranked by how many bookings they had |
| **Stock levels** | nothing | every material's quantity now |

A preset and dates are never used together: choosing Day, Week or Month clears
the dates.

---

## 6. What this version does not do

- **No SMS is actually sent.** The system records every message it would send
  (the administrator sees them under an appointment's **Notifications**), but
  no text reaches a phone. A client keeps the appointment's link from the page
  shown after booking.
- **No online payment.** Payments are recorded by the administrator after the
  visit.
- **No client accounts and no password reset.**
- **Date and time fields** use your browser's own pickers, so their format
  follows your browser (`mm/dd/yyyy` or `dd.mm.yyyy`; 12 or 24 hours). Times
  shown follow your browser's 12- or 24-hour choice too, always in English;
  every date shown is written `Mon 16 Nov 2026`.
- **The staff dashboard** is made for a computer screen; the client website
  works on a phone.
