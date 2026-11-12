/**
 * Notification preferences — the pure half (S4.1, I2).
 *
 * A preference is a channel × event combination. The contract fixes both
 * enumerations (`NotificationPreference.channel` ∈ {sms, in_app},
 * `eventType` ∈ {new, reschedule, cancellation}), so the six combinations are a
 * constant, not a query: M5 answers all six whatever the table holds.
 *
 * The table is a **sparse override** (I2): a row exists only for a combination
 * the caller has toggled, and a missing one means `enabled: true`. That is why
 * `preferenceViews` takes the stored rows and fills the gaps rather than
 * returning them: the caller's settings are the six combinations, and the table
 * is how six of them are remembered.
 *
 * Source: REQ-F-016 ("per their own preferences"; AC: "Disabling all channels
 *         for an event type results in no notification of that type being sent
 *         to that master"), REQ-F-023, REQ-F-026 ("Toggling one channel/event
 *         combination does not change any other channel/event combination's
 *         setting"); SCN-06;
 *         `openapi.yaml` NotificationPreference, NotificationPreferencePatch.
 * Contract: openapi.yaml#/components/schemas/NotificationPreference.
 * Ticket: SMS-30 (Feature)
 */

/** The two channels the contract enumerates. */
export type PreferenceChannel = 'sms' | 'in_app';

/** The three event types a preference can be set for. */
export type PreferenceEvent = 'new' | 'reschedule' | 'cancellation';

/** The channels, in the order M5 answers them (I2). */
export const PREFERENCE_CHANNELS: readonly PreferenceChannel[] = ['sms', 'in_app'];

/** The event types, in the order M5 answers them (I2). */
export const PREFERENCE_EVENTS: readonly PreferenceEvent[] = [
  'new',
  'reschedule',
  'cancellation',
];

/** One combination, as M5 and M6 answer it. */
export interface PreferenceView {
  readonly channel: PreferenceChannel;
  readonly eventType: PreferenceEvent;
  readonly enabled: boolean;
}

/** A stored row, as the table returns it. */
export interface PreferenceOverride {
  readonly channel: string;
  readonly eventType: string;
  readonly enabled: boolean;
}

/** True when the value is one of the contract's channels. */
export function isPreferenceChannel(value: string): value is PreferenceChannel {
  return (PREFERENCE_CHANNELS as readonly string[]).includes(value);
}

/** True when the value is one of the contract's event types. */
export function isPreferenceEvent(value: string): value is PreferenceEvent {
  return (PREFERENCE_EVENTS as readonly string[]).includes(value);
}

/**
 * The six combinations, with the stored overrides applied.
 *
 * A stored row whose channel or event type is outside the contract's enums is
 * ignored rather than surfaced: the table's CHECK constraints make it
 * impossible, and a read is not the place to raise an invariant that the schema
 * already enforces.
 */
export function preferenceViews(
  overrides: readonly PreferenceOverride[],
): PreferenceView[] {
  const stored = new Map<string, boolean>();
  for (const row of overrides) {
    if (!isPreferenceChannel(row.channel) || !isPreferenceEvent(row.eventType)) continue;
    stored.set(`${row.channel}/${row.eventType}`, row.enabled);
  }

  return PREFERENCE_CHANNELS.flatMap((channel) =>
    PREFERENCE_EVENTS.map((eventType) => ({
      channel,
      eventType,
      enabled: stored.get(`${channel}/${eventType}`) ?? true,
    })),
  );
}

/**
 * The channels an event of this type is delivered on, for one principal.
 *
 * This is REQ-F-016's AC in one line: a combination that is off contributes no
 * channel, so the caller writes no row for it (I5).
 */
export function enabledChannels(
  overrides: readonly PreferenceOverride[],
  eventType: PreferenceEvent,
): PreferenceChannel[] {
  return preferenceViews(overrides)
    .filter((row) => row.eventType === eventType && row.enabled)
    .map((row) => row.channel);
}
