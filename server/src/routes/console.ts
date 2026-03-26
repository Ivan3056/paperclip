import { Router } from "express";
import { createConsoleService } from "../services/console.js";
import type { Db } from "@paperclipai/db";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { assertBoard } from "./authz.js";

export function consoleRoutes(db: Db) {
  const router = Router();
  const consoleService = createConsoleService(db);

  /**
   * POST /api/console/session
   * Get or create a console session for the current user/company.
   */
  router.post("/console/session", async (req, res) => {
    try {
      assertBoard(req);
      const { companyId } = req.body as { companyId: string };

      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }

      assertCompanyAccess(req, companyId);

      const actorInfo = getActorInfo(req);
      if (actorInfo.actorType !== "user") {
        res.status(403).json({ error: "Board user access required" });
        return;
      }

      const session = await consoleService.getOrCreateSession(companyId, actorInfo.actorId);
      res.json({
        session: {
          id: session.id,
          companyId: session.companyId,
          cwd: session.cwd,
          isActive: session.isActive,
          createdAt: session.createdAt.toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Board access required") {
        res.status(403).json({ error: "Board access required" });
        return;
      }
      if (error instanceof Error && error.message.includes("does not have access")) {
        res.status(403).json({ error: error.message });
        return;
      }
      console.error("[console] Error creating session:", error);
      res.status(500).json({ error: "Failed to create console session" });
    }
  });

  /**
   * GET /api/console/session/:sessionId
   * Get console session details.
   */
  router.get("/console/session/:sessionId", async (req, res) => {
    try {
      assertBoard(req);
      const { sessionId } = req.params;
      const { companyId } = req.query as { companyId: string };

      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }

      assertCompanyAccess(req, companyId);

      const session = await consoleService.getSession(sessionId, companyId);
      if (!session) {
        res.status(404).json({ error: "Console session not found" });
        return;
      }

      res.json({
        session: {
          id: session.id,
          companyId: session.companyId,
          cwd: session.cwd,
          isActive: session.isActive,
          createdAt: session.createdAt.toISOString(),
        },
      });
    } catch (error) {
      console.error("[console] Error getting session:", error);
      res.status(500).json({ error: "Failed to get console session" });
    }
  });

  /**
   * POST /api/console/session/:sessionId/execute
   * Execute a command in the console session.
   */
  router.post("/console/session/:sessionId/execute", async (req, res) => {
    try {
      assertBoard(req);
      const { sessionId } = req.params;
      const { companyId } = req.query as { companyId: string };
      const { command, cwd } = req.body as { command: string; cwd?: string };

      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }

      assertCompanyAccess(req, companyId);

      if (!command || typeof command !== "string") {
        res.status(400).json({ error: "command is required" });
        return;
      }

      // Security: block dangerous commands
      const blockedCommands = [
        "rm -rf /",
        "rm -rf /*",
        "mkfs",
        "dd if=/dev/zero",
        ":(){:|:&};:",
        "chmod -R 777 /",
        "chown -R",
      ];

      const normalizedCommand = command.toLowerCase().trim();
      for (const blocked of blockedCommands) {
        if (normalizedCommand.startsWith(blocked.toLowerCase())) {
          res.status(403).json({ 
            error: "Command blocked for security reasons",
            blocked: true,
          });
          return;
        }
      }

      const session = await consoleService.getSession(sessionId, companyId);
      if (!session) {
        res.status(404).json({ error: "Console session not found" });
        return;
      }

      const result = await consoleService.executeCommand(sessionId, command, { cwd });

      res.json({
        success: true,
        result: {
          logId: result.logId,
          output: result.output,
          exitCode: result.exitCode,
          isError: result.isError,
        },
      });
    } catch (error) {
      console.error("[console] Error executing command:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to execute command",
      });
    }
  });

  /**
   * GET /api/console/session/:sessionId/logs
   * Get command history for a console session.
   */
  router.get("/console/session/:sessionId/logs", async (req, res) => {
    try {
      assertBoard(req);
      const { sessionId } = req.params;
      const { companyId, limit } = req.query as { companyId: string; limit?: string };

      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }

      assertCompanyAccess(req, companyId);

      const session = await consoleService.getSession(sessionId, companyId);
      if (!session) {
        res.status(404).json({ error: "Console session not found" });
        return;
      }

      const logs = await consoleService.getSessionLogs(
        sessionId, 
        limit ? parseInt(limit, 10) : 50
      );

      res.json({
        logs: logs.map((log) => ({
          id: log.id,
          command: log.command,
          output: log.output,
          exitCode: log.exitCode,
          isError: log.isError,
          startedAt: log.startedAt.toISOString(),
          completedAt: log.completedAt?.toISOString(),
        })),
      });
    } catch (error) {
      console.error("[console] Error getting logs:", error);
      res.status(500).json({ error: "Failed to get console logs" });
    }
  });

  /**
   * POST /api/console/session/:sessionId/cwd
   * Update the working directory for a console session.
   */
  router.post("/console/session/:sessionId/cwd", async (req, res) => {
    try {
      assertBoard(req);
      const { sessionId } = req.params;
      const { companyId } = req.query as { companyId: string };
      const { cwd } = req.body as { cwd: string };

      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }

      assertCompanyAccess(req, companyId);

      if (!cwd || typeof cwd !== "string") {
        res.status(400).json({ error: "cwd is required" });
        return;
      }

      const session = await consoleService.getSession(sessionId, companyId);
      if (!session) {
        res.status(404).json({ error: "Console session not found" });
        return;
      }

      await consoleService.updateCwd(sessionId, cwd);

      res.json({ success: true, cwd });
    } catch (error) {
      console.error("[console] Error updating cwd:", error);
      res.status(500).json({ error: "Failed to update working directory" });
    }
  });

  /**
   * DELETE /api/console/session/:sessionId
   * Close a console session.
   */
  router.delete("/console/session/:sessionId", async (req, res) => {
    try {
      assertBoard(req);
      const { sessionId } = req.params;
      const { companyId } = req.query as { companyId: string };

      if (!companyId) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }

      assertCompanyAccess(req, companyId);

      await consoleService.closeSession(sessionId);

      res.json({ success: true });
    } catch (error) {
      console.error("[console] Error closing session:", error);
      res.status(500).json({ error: "Failed to close console session" });
    }
  });

  return router;
}
