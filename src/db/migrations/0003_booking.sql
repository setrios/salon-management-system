CREATE TABLE "appointment_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"base_duration_minutes" integer NOT NULL,
	"price_amount_minor" integer NOT NULL,
	"price_currency" text DEFAULT 'UAH' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_services_appointment_position_unique" UNIQUE("appointment_id","position"),
	CONSTRAINT "appointment_services_duration_check" CHECK ("appointment_services"."base_duration_minutes" > 0),
	CONSTRAINT "appointment_services_price_check" CHECK ("appointment_services"."price_amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"master_id" uuid NOT NULL,
	"client_name" text NOT NULL,
	"client_phone" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"total_duration_minutes" integer NOT NULL,
	"occupied_duration_minutes" integer NOT NULL,
	"total_price_amount_minor" integer NOT NULL,
	"total_price_currency" text DEFAULT 'UAH' NOT NULL,
	"access_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_access_token_unique" UNIQUE("access_token"),
	CONSTRAINT "appointments_status_check" CHECK ("appointments"."status" in ('confirmed', 'completed', 'cancelled')),
	CONSTRAINT "appointments_block_check" CHECK ("appointments"."end_at" > "appointments"."start_at"),
	CONSTRAINT "appointments_durations_check" CHECK ("appointments"."total_duration_minutes" > 0 and "appointments"."occupied_duration_minutes" >= 30),
	CONSTRAINT "appointments_price_check" CHECK ("appointments"."total_price_amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_master_start_unique" ON "appointments" USING btree ("master_id","start_at") WHERE "appointments"."status" <> 'cancelled';