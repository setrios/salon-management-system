CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"event_type" text NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_channel_check" CHECK ("notification_preferences"."channel" in ('sms', 'in_app')),
	CONSTRAINT "notification_preferences_event_type_check" CHECK ("notification_preferences"."event_type" in ('new', 'reschedule', 'cancellation'))
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_principal_id_masters_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_principal_channel_event_unique" ON "notification_preferences" USING btree ("principal_id","channel","event_type");