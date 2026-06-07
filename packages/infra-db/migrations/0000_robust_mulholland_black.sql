CREATE TABLE "corpus_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etiqueta" text NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"publicada_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "documento_generado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"establecimiento" text NOT NULL,
	"corpus_version_id" uuid NOT NULL,
	"origen_id" uuid,
	"unidad_planificada_id" uuid,
	"estado_revision" text DEFAULT 'borrador' NOT NULL,
	"estado_generacion" text DEFAULT 'pendiente' NOT NULL,
	"payload" jsonb,
	"resultado_gates" jsonb,
	"autor_humano" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_aprobado_requiere_humano" CHECK ("documento_generado"."estado_revision" <> 'aprobado' OR "documento_generado"."autor_humano" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "job_generacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documento_id" uuid,
	"unidad_planificada_id" uuid,
	"tipo_trabajo" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"payload" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objetivo_aprendizaje" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"corpus_version_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"asignatura" text NOT NULL,
	"nivel" text NOT NULL,
	"descripcion" text NOT NULL,
	"eje" text,
	"tipo" text,
	"indicadores" jsonb,
	"vigencia_desde" date,
	"vigencia_hasta" date,
	CONSTRAINT "oa_corpus_codigo_unique" UNIQUE("corpus_version_id","codigo")
);
--> statement-breakpoint
CREATE TABLE "planificacion_anual" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establecimiento" text NOT NULL,
	"asignatura" text NOT NULL,
	"nivel" text NOT NULL,
	"anio" integer NOT NULL,
	"corpus_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traza_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documento_id" uuid NOT NULL,
	"corpus_version_id" uuid NOT NULL,
	"modelo" text NOT NULL,
	"ruta_decision" text,
	"usage" jsonb,
	"gates" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unidad_planificada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planificacion_anual_id" uuid NOT NULL,
	"orden" integer NOT NULL,
	"titulo" text NOT NULL,
	"oa_codigos" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"inicio" date,
	"fin" date,
	"semanas" integer
);
--> statement-breakpoint
ALTER TABLE "documento_generado" ADD CONSTRAINT "documento_generado_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_generado" ADD CONSTRAINT "documento_generado_unidad_planificada_id_unidad_planificada_id_fk" FOREIGN KEY ("unidad_planificada_id") REFERENCES "public"."unidad_planificada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_generado" ADD CONSTRAINT "documento_generado_origen_id_fk" FOREIGN KEY ("origen_id") REFERENCES "public"."documento_generado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_generacion" ADD CONSTRAINT "job_generacion_documento_id_documento_generado_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documento_generado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_generacion" ADD CONSTRAINT "job_generacion_unidad_planificada_id_unidad_planificada_id_fk" FOREIGN KEY ("unidad_planificada_id") REFERENCES "public"."unidad_planificada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objetivo_aprendizaje" ADD CONSTRAINT "objetivo_aprendizaje_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planificacion_anual" ADD CONSTRAINT "planificacion_anual_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traza_ia" ADD CONSTRAINT "traza_ia_documento_id_documento_generado_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documento_generado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traza_ia" ADD CONSTRAINT "traza_ia_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidad_planificada" ADD CONSTRAINT "unidad_planificada_planificacion_anual_id_planificacion_anual_id_fk" FOREIGN KEY ("planificacion_anual_id") REFERENCES "public"."planificacion_anual"("id") ON DELETE no action ON UPDATE no action;