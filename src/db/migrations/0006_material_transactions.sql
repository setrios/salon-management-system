CREATE TABLE "material_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"type" text NOT NULL,
	"quantity" double precision NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_transactions_type_check" CHECK ("material_transactions"."type" in ('receipt', 'issue')),
	CONSTRAINT "material_transactions_quantity_check" CHECK ("material_transactions"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "material_transactions" ADD CONSTRAINT "material_transactions_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_transactions_material_occurred_idx" ON "material_transactions" USING btree ("material_id","occurred_at");