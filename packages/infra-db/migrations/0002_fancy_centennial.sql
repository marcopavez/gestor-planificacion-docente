CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"plan" text DEFAULT 'trial' NOT NULL,
	"generaciones_usadas" integer DEFAULT 0 NOT NULL,
	"periodo_inicio" timestamp with time zone,
	"mp_preapproval_id" text,
	"suscripcion_estado" text,
	"periodo_fin" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "documento_generado" ADD COLUMN "usuario_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "job_generacion" ADD COLUMN "usuario_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "planificacion_anual" ADD COLUMN "usuario_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "documento_generado" ADD CONSTRAINT "documento_generado_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_generacion" ADD CONSTRAINT "job_generacion_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planificacion_anual" ADD CONSTRAINT "planificacion_anual_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;