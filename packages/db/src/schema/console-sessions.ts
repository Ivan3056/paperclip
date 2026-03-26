import { pgTable, uuid, text, timestamp, index, boolean, integer } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { authUsers } from "./auth.js";

/**
 * Console sessions for real-time terminal access.
 * Each session is scoped to a company and user.
 */
export const consoleSessions = pgTable(
  "console_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    cwd: text("cwd").notNull().default("/"),
    isActive: boolean("is_active").notNull().default(true),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("console_sessions_company_idx").on(table.companyId),
    userIdx: index("console_sessions_user_idx").on(table.userId),
    activeIdx: index("console_sessions_active_idx").on(table.isActive),
  }),
);

/**
 * Console command history and output logs.
 */
export const consoleLogs = pgTable(
  "console_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => consoleSessions.id, { onDelete: "cascade" }),
    command: text("command").notNull(),
    output: text("output"),
    exitCode: integer("exit_code"),
    isError: boolean("is_error").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    sessionIdx: index("console_logs_session_idx").on(table.sessionId),
    startedAtIdx: index("console_logs_started_at_idx").on(table.startedAt),
  }),
);
