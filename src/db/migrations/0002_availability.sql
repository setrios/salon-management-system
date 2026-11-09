CREATE TABLE "availability_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"master_id" uuid NOT NULL,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_dates_window_check" CHECK ("availability_dates"."end_time" > "availability_dates"."start_time")
);
--> statement-breakpoint
CREATE TABLE "availability_weekly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"master_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_weekly_day_check" CHECK ("availability_weekly"."day_of_week" between 1 and 7),
	CONSTRAINT "availability_weekly_window_check" CHECK ("availability_weekly"."end_time" > "availability_weekly"."start_time")
);
--> statement-breakpoint
ALTER TABLE "availability_dates" ADD CONSTRAINT "availability_dates_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_weekly" ADD CONSTRAINT "availability_weekly_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id") ON DELETE no action ON UPDATE no action;