CREATE TABLE "published_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(220) NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body_md" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_id" text,
	"public" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "published_artifacts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "published_artifacts_slug_idx" ON "published_artifacts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "published_artifacts_source_idx" ON "published_artifacts" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "published_artifacts_updated_idx" ON "published_artifacts" USING btree ("updated_at");