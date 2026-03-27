import { pgTable, text, timestamp, integer, primaryKey } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const issueRunAttempts = pgTable(
  "issue_run_attempts",
  {
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => heartbeatRuns.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.runId] }),
  ],
);
