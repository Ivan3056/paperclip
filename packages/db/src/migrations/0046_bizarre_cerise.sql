CREATE TABLE "console_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"command" text NOT NULL,
	"output" text,
	"exit_code" integer,
	"is_error" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "console_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"cwd" text DEFAULT '/' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "console_logs" ADD CONSTRAINT "console_logs_session_id_console_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."console_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "console_sessions" ADD CONSTRAINT "console_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "console_sessions" ADD CONSTRAINT "console_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "console_logs_session_idx" ON "console_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "console_logs_started_at_idx" ON "console_logs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "console_sessions_company_idx" ON "console_sessions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "console_sessions_user_idx" ON "console_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "console_sessions_active_idx" ON "console_sessions" USING btree ("is_active");