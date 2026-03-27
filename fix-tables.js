import postgres from "./node_modules/.pnpm/postgres@3.4.8/node_modules/postgres/src/index.js";

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
  `ALTER TABLE "issue_comments_reactions" ADD CONSTRAINT "issue_comments_reactions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
  `ALTER TABLE "issue_comments_reactions" ADD CONSTRAINT "issue_comments_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade`,
  `ALTER TABLE "issue_run_attempts" ADD CONSTRAINT "issue_run_attempts_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
  `ALTER TABLE "issue_run_attempts" ADD CONSTRAINT "issue_run_attempts_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade`,
  `ALTER TABLE "issue_subscriptions" ADD CONSTRAINT "issue_subscriptions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade`,
  `ALTER TABLE "issue_subscriptions" ADD CONSTRAINT "issue_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade`,
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
    } catch (err) {
      if (err.code === "42710") {
        console.log(`FK already exists: ${fk.substring(0, 80)}...`);
      } else {
        throw err;
      }
    }
  }
  console.log("Foreign keys added!");

  console.log("Done!");
  await sql.end();
}

main().catch(console.error);
