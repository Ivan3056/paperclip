ALTER TABLE "cost_events" DROP CONSTRAINT "cost_events_issue_id_issues_id_fk";
--> statement-breakpoint
DROP INDEX "board_api_keys_key_hash_idx";--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_api_keys_key_hash_idx" ON "board_api_keys" USING btree ("key_hash");