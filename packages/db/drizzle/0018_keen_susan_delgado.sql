CREATE TABLE "mobile_builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"profile" text DEFAULT 'preview' NOT NULL,
	"eas_build_id" text NOT NULL,
	"install_url" text NOT NULL,
	"artifact_url" text,
	"status" text NOT NULL,
	"git_sha" text,
	"built_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mobile_builds_eas_build_id_uq" UNIQUE("eas_build_id")
);
--> statement-breakpoint
CREATE INDEX "mobile_builds_platform_built_at_idx" ON "mobile_builds" USING btree ("platform","built_at");
