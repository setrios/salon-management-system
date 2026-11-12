CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"event_type" text NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_audience_check" CHECK ("notifications"."audience" in ('client', 'master', 'admin')),
	CONSTRAINT "notifications_event_type_check" CHECK ("notifications"."event_type" in ('new', 'reschedule', 'cancellation', 'reminder_24h', 'reminder_2h')),
	CONSTRAINT "notifications_channel_check" CHECK ("notifications"."channel" in ('sms', 'in_app')),
	CONSTRAINT "notifications_status_check" CHECK ("notifications"."status" in ('scheduled', 'sent', 'skipped', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_appointment_new_client_sms_unique" ON "notifications" USING btree ("appointment_id") WHERE "notifications"."event_type" = 'new' and "notifications"."audience" = 'client' and "notifications"."channel" = 'sms';