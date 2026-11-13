CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'UAH' NOT NULL,
	"status" text NOT NULL,
	"method" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payments_appointment_id_unique" UNIQUE("appointment_id"),
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount_minor" >= 0),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" in ('paid', 'unpaid')),
	CONSTRAINT "payments_method_check" CHECK ("payments"."method" in ('cash', 'card'))
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;