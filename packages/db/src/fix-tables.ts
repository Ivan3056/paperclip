import postgres from "postgres";

// Default embedded postgres port - try 54329 first (paperclip default)
const PORT = process.env.PAPERCLIP_EMBEDDED_POSTGRES_PORT || "54329";
const url = process.env.DATABASE_URL || `postgres://paperclip:paperclip@127.0.0.1:${PORT}/paperclip?sslmode=disable`;

const sql = postgres(url);

const tables = `
CREATE TABLE IF NOT EXISTS "issue_comments_reactions" (
	"issue_id" text NOT NULL,
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reaction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_comments_reactions_issue_id_comment_id_user_id_reaction_pk" PRIMARY KEY("issue_id","comment_id","user_id","reaction")
);

CREATE TABLE IF NOT EXISTS "issue_run_attempts" (
	"issue_id" text NOT NULL,
	"run_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_run_attempts_issue_id_run_id_pk" PRIMARY KEY("issue_id","run_id")
);

CREATE TABLE IF NOT EXISTS "issue_subscriptions" (
	"issue_id" text NOT NULL,
	"user_id" text NOT NULL,
	"subscribed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_subscriptions_issue_id_user_id_pk" PRIMARY KEY("issue_id","user_id")
);
`;

const fks = [
  // issue_comments_reactions
  `ALTER TABLE "issue_comments_reactions" ADD CONSTRAINT "issue_comments_reactions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
  `ALTER TABLE "issue_comments_reactions" ADD CONSTRAINT "issue_comments_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade`,
  // issue_run_attempts
  `ALTER TABLE "issue_run_attempts" ADD CONSTRAINT "issue_run_attempts_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
  `ALTER TABLE "issue_run_attempts" ADD CONSTRAINT "issue_run_attempts_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade`,
  // issue_subscriptions
  `ALTER TABLE "issue_subscriptions" ADD CONSTRAINT "issue_subscriptions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
  `ALTER TABLE "issue_subscriptions" ADD CONSTRAINT "issue_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade`,
  // issue_read_states - needs CASCADE
  `ALTER TABLE "issue_read_states" DROP CONSTRAINT IF EXISTS "issue_read_states_issue_id_issues_id_fk"`,
  `ALTER TABLE "issue_read_states" ADD CONSTRAINT "issue_read_states_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
  // issue_documents
  `ALTER TABLE "issue_documents" DROP CONSTRAINT IF EXISTS "issue_documents_issue_id_issues_id_fk"`,
  `ALTER TABLE "issue_documents" ADD CONSTRAINT "issue_documents_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
  // issue_attachments
  `ALTER TABLE "issue_attachments" DROP CONSTRAINT IF EXISTS "issue_attachments_issue_id_issues_id_fk"`,
  `ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
  // issue_comments
  `ALTER TABLE "issue_comments" DROP CONSTRAINT IF EXISTS "issue_comments_issue_id_issues_id_fk"`,
  `ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
  // issue_approvals
  `ALTER TABLE "issue_approvals" DROP CONSTRAINT IF EXISTS "issue_approvals_issue_id_issues_id_fk"`,
  `ALTER TABLE "issue_approvals" ADD CONSTRAINT "issue_approvals_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
  // issue_work_products
  `ALTER TABLE "issue_work_products" DROP CONSTRAINT IF EXISTS "issue_work_products_issue_id_issues_id_fk"`,
  `ALTER TABLE "issue_work_products" ADD CONSTRAINT "issue_work_products_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
  // issue_labels
  `ALTER TABLE "issue_labels" DROP CONSTRAINT IF EXISTS "issue_labels_issue_id_issues_id_fk"`,
  `ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
  // issue_inbox_archives
  `ALTER TABLE "issue_inbox_archives" DROP CONSTRAINT IF EXISTS "issue_inbox_archives_issue_id_issues_id_fk"`,
  `ALTER TABLE "issue_inbox_archives" ADD CONSTRAINT "issue_inbox_archives_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
];

async function main() {
  console.log("Creating tables...");
  await sql.unsafe(tables);
  console.log("Tables created!");

  console.log("Adding foreign keys...");
  for (const fk of fks) {
    try {
      await sql.unsafe(fk);
      console.log(`Added: ${fk.substring(0, 80)}...`);
    } catch (err: any) {
      if (err.code === "42710") {
        console.log(`FK already exists: ${fk.substring(0, 80)}...`);
      } else {
        console.error(`Error adding FK: ${err.message}`);
      }
    }
  }
  console.log("Foreign keys added!");

  console.log("Done!");
  await sql.end();
  process.exit(0);
}

main().catch(console.error);
