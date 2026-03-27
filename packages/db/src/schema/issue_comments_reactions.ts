import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { authUsers } from "./auth.js";

export const issueCommentsReactions = pgTable(
  "issue_comments_reactions",
  {
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    commentId: text("comment_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    reaction: text("reaction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.commentId, table.userId, table.reaction] }),
  ],
);
