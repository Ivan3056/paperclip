import { pgTable, text, timestamp, boolean, primaryKey } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { authUsers } from "./auth.js";

export const issueSubscriptions = pgTable(
  "issue_subscriptions",
  {
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    subscribed: boolean("subscribed").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.userId] }),
  ],
);
