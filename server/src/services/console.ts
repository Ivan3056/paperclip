import { and, eq, desc, sql } from "drizzle-orm";
import type { Db } from "../db.js";
import { consoleSessions, consoleLogs } from "../schema/console-sessions.js";
import { spawn } from "child_process";
import { EventEmitter } from "events";

export interface ConsoleSession {
  id: string;
  companyId: string;
  userId: string;
  cwd: string;
  isActive: boolean;
  lastActivityAt: Date | null;
  createdAt: Date;
}

export interface ConsoleLogEntry {
  id: string;
  sessionId: string;
  command: string;
  output: string | null;
  exitCode: number | null;
  isError: boolean;
  startedAt: Date;
  completedAt: Date | null;
}

export interface ExecuteCommandResult {
  logId: string;
  output: string;
  exitCode: number;
  isError: boolean;
}

export interface ConsoleOutputChunk {
  type: "stdout" | "stderr" | "error";
  data: string;
  timestamp: string;
}

/**
 * Console service for managing real-time terminal sessions.
 */
export class ConsoleService {
  private db: Db;
  private activeSessions: Map<string, EventEmitter> = new Map();

  constructor(db: Db) {
    this.db = db;
  }

  /**
   * Create or get existing console session for a user/company.
   */
  async getOrCreateSession(companyId: string, userId: string): Promise<ConsoleSession> {
    // Try to find existing active session
    const existing = await this.db
      .select()
      .from(consoleSessions)
      .where(
        and(
          eq(consoleSessions.companyId, companyId),
          eq(consoleSessions.userId, userId),
          eq(consoleSessions.isActive, true),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      // Update last activity
      await this.db
        .update(consoleSessions)
        .set({ lastActivityAt: new Date() })
        .where(eq(consoleSessions.id, existing[0].id));

      return existing[0];
    }

    // Create new session
    const [newSession] = await this.db
      .insert(consoleSessions)
      .values({
        companyId,
        userId,
        cwd: process.cwd(),
        isActive: true,
      })
      .returning();

    return newSession;
  }

  /**
   * Get session by ID with access check.
   */
  async getSession(sessionId: string, companyId: string): Promise<ConsoleSession | null> {
    const sessions = await this.db
      .select()
      .from(consoleSessions)
      .where(and(eq(consoleSessions.id, sessionId), eq(consoleSessions.companyId, companyId)))
      .limit(1);

    return sessions[0] ?? null;
  }

  /**
   * Get recent logs for a session.
   */
  async getSessionLogs(sessionId: string, limit = 50): Promise<ConsoleLogEntry[]> {
    return this.db
      .select()
      .from(consoleLogs)
      .where(eq(consoleLogs.sessionId, sessionId))
      .orderBy(desc(consoleLogs.startedAt))
      .limit(limit);
  }

  /**
   * Execute a shell command and store the result.
   */
  async executeCommand(
    sessionId: string,
    command: string,
    options?: { cwd?: string; timeoutMs?: number },
  ): Promise<ExecuteCommandResult> {
    const session = await this.db
      .select()
      .from(consoleSessions)
      .where(eq(consoleSessions.id, sessionId))
      .limit(1);

    if (!session.length) {
      throw new Error("Console session not found");
    }

    const cwd = options?.cwd ?? session[0].cwd;
    const timeoutMs = options?.timeoutMs ?? 60000; // 60s default

    // Create log entry
    const [logEntry] = await this.db
      .insert(consoleLogs)
      .values({
        sessionId,
        command,
        isError: false,
      })
      .returning();

    let output = "";
    let errorOutput = "";
    let exitCode: number | null = null;
    let isError = false;

    return new Promise((resolve, reject) => {
      const child = spawn(command, [], {
        shell: true,
        cwd,
        timeout: timeoutMs,
        env: { ...process.env, FORCE_COLOR: "0" }, // Disable colors for cleaner logs
      });

      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        errorOutput += "\n[Console] Command timed out after " + timeoutMs + "ms\n";
        isError = true;
      }, timeoutMs);

      child.stdout?.on("data", (data: Buffer) => {
        output += data.toString("utf8");
      });

      child.stderr?.on("data", (data: Buffer) => {
        errorOutput += data.toString("utf8");
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        errorOutput += `\n[Console] Error: ${err.message}\n`;
        isError = true;
      });

      child.on("close", async (code) => {
        clearTimeout(timeout);
        exitCode = code ?? 1;
        isError = code !== 0 || isError;

        const combinedOutput = errorOutput ? `${output}${errorOutput}` : output;

        // Update log entry
        await this.db
          .update(consoleLogs)
          .set({
            output: combinedOutput || null,
            exitCode,
            isError,
            completedAt: new Date(),
          })
          .where(eq(consoleLogs.id, logEntry.id));

        // Update session last activity
        await this.db
          .update(consoleSessions)
          .set({ lastActivityAt: new Date() })
          .where(eq(consoleSessions.id, sessionId));

        resolve({
          logId: logEntry.id,
          output: combinedOutput,
          exitCode,
          isError,
        });
      });
    });
  }

  /**
   * Update session working directory.
   */
  async updateCwd(sessionId: string, cwd: string): Promise<void> {
    await this.db
      .update(consoleSessions)
      .set({ cwd, lastActivityAt: new Date() })
      .where(eq(consoleSessions.id, sessionId));
  }

  /**
   * Close a console session.
   */
  async closeSession(sessionId: string): Promise<void> {
    await this.db
      .update(consoleSessions)
      .set({ isActive: false, lastActivityAt: new Date() })
      .where(eq(consoleSessions.id, sessionId));

    // Clean up event emitter if exists
    const emitter = this.activeSessions.get(sessionId);
    if (emitter) {
      emitter.removeAllListeners();
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Get or create event emitter for real-time output streaming.
   */
  getSessionEmitter(sessionId: string): EventEmitter {
    let emitter = this.activeSessions.get(sessionId);
    if (!emitter) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(100);
      this.activeSessions.set(sessionId, emitter);
    }
    return emitter;
  }

  /**
   * Emit output chunk to session listeners.
   */
  emitOutputChunk(sessionId: string, chunk: ConsoleOutputChunk): void {
    const emitter = this.activeSessions.get(sessionId);
    if (emitter) {
      emitter.emit("output", chunk);
    }
  }

  /**
   * Clean up inactive sessions (older than 24 hours).
   */
  async cleanupInactiveSessions(): Promise<number> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await this.db
      .update(consoleSessions)
      .set({ isActive: false })
      .where(
        and(
          eq(consoleSessions.isActive, true),
          sql`${consoleSessions.lastActivityAt} < ${twentyFourHoursAgo}`,
        ),
      );

    return result.rowCount ?? 0;
  }
}

/**
 * Create console service instance.
 */
export function createConsoleService(db: Db): ConsoleService {
  return new ConsoleService(db);
}
