import { Router } from "express";
import { spawn, type ChildProcess } from "node:child_process";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { z } from "zod";

const executeCommandSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout: z.number().optional().default(30000),
});

export interface ConsoleExecuteRequest {
  command: string;
  cwd?: string;
  timeout?: number;
}

export interface ConsoleExecuteResponse {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  duration: number;
}

interface TerminalSession {
  id: string;
  process: ChildProcess | null;
  ws: WebSocket;
  cwd: string;
  createdAt: number;
}

const sessions = new Map<string, TerminalSession>();

function generateSessionId(): string {
  return `term_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function escapeShellCommand(cmd: string): string {
  // Basic escaping for shell command
  return cmd.replace(/'/g, "'\\''");
}

/**
 * Execute a single command and return output
 */
export async function executeCommand(req: ConsoleExecuteRequest): Promise<ConsoleExecuteResponse> {
  const { command, cwd = process.cwd(), timeout } = req;

  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";

    const child = spawn(command, {
      shell: true,
      cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    const timeoutId = setTimeout(() => {
      child.kill("SIGKILL");
      stderr += `\n[Timeout after ${timeout}ms]\n`;
      resolve({
        stdout,
        stderr,
        exitCode: null,
        signal: "SIGKILL",
        duration: Date.now() - startTime,
      });
    }, timeout);

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal: signal ?? null,
        duration: Date.now() - startTime,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timeoutId);
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: null,
        signal: null,
        duration: Date.now() - startTime,
      });
    });
  });
}

/**
 * Create interactive terminal session via WebSocket
 */
export function createTerminalSession(
  ws: WebSocket,
  cwd: string = process.cwd(),
): TerminalSession {
  const id = generateSessionId();
  
  const session: TerminalSession = {
    id,
    process: null,
    ws,
    cwd,
    createdAt: Date.now(),
  };

  sessions.set(id, session);

  ws.on("close", () => {
    terminateSession(id);
  });

  ws.on("error", () => {
    terminateSession(id);
  });

  return session;
}

export function startSessionProcess(
  sessionId: string,
  shell: string = process.platform === "win32" ? "cmd.exe" : "/bin/bash",
): void {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const child = spawn(shell, [], {
    shell: false,
    cwd: session.cwd,
    env: { ...process.env, TERM: "xterm-256color" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  session.process = child;

  child.stdout?.on("data", (data: Buffer) => {
    if (session.ws.readyState === 1) {
      session.ws.send(JSON.stringify({ type: "stdout", data: data.toString() }));
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    if (session.ws.readyState === 1) {
      session.ws.send(JSON.stringify({ type: "stderr", data: data.toString() }));
    }
  });

  child.on("close", (code, signal) => {
    if (session.ws.readyState === 1) {
      session.ws.send(JSON.stringify({
        type: "exit",
        code,
        signal: signal ?? null,
      }));
    }
    sessions.delete(sessionId);
  });

  child.on("error", (err) => {
    if (session.ws.readyState === 1) {
      session.ws.send(JSON.stringify({ type: "error", message: err.message }));
    }
    sessions.delete(sessionId);
  });
}

export function sendInputToSession(sessionId: string, input: string): void {
  const session = sessions.get(sessionId);
  if (!session?.process) {
    throw new Error(`Session ${sessionId} not found or not running`);
  }

  session.process.stdin?.write(input);
}

export function resizeSession(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId);
  if (!session?.process) {
    return;
  }

  // Only works on Unix-like systems with PTY
  if (process.platform !== "win32" && "setRawMode" in session.process) {
    try {
      (session.process as any).setRawMode(true);
    } catch {
      // Ignore if not supported
    }
  }
}

export function terminateSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (session.process) {
    session.process.kill("SIGTERM");
    setTimeout(() => {
      if (session.process && !session.process.killed) {
        session.process.kill("SIGKILL");
      }
    }, 2000);
  }

  sessions.delete(sessionId);
}

export function getSession(sessionId: string): TerminalSession | undefined {
  return sessions.get(sessionId);
}

export function listSessions(): Array<{ id: string; cwd: string; createdAt: number }> {
  return Array.from(sessions.values()).map((s) => ({
    id: s.id,
    cwd: s.cwd,
    createdAt: s.createdAt,
  }));
}

export const consoleRoutes = Router();

/**
 * POST /api/console/execute
 * Execute a single command and return output
 */
consoleRoutes.post("/execute", async (req, res) => {
  try {
    const result = executeCommandSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.message });
      return;
    }

    const response = await executeCommand(result.data);
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/console/sessions
 * List active terminal sessions
 */
consoleRoutes.get("/sessions", (_req, res) => {
  res.json({ sessions: listSessions() });
});

/**
 * DELETE /api/console/sessions/:id
 * Terminate a terminal session
 */
consoleRoutes.delete("/sessions/:id", (req, res) => {
  try {
    terminateSession(req.params.id);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

/**
 * WebSocket endpoint for interactive terminal
 * WS /api/console/terminal
 */
export function attachConsoleWebSocket(server: any, path: string = "/api/console/terminal") {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws: WebSocket) => {
    const session = createTerminalSession(ws);

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        switch (message.type) {
          case "init": {
            // Initialize session with shell
            startSessionProcess(session.id, message.shell);
            ws.send(JSON.stringify({ type: "init", sessionId: session.id }));
            break;
          }
          case "input": {
            sendInputToSession(session.id, message.data);
            break;
          }
          case "resize": {
            resizeSession(session.id, message.cols, message.rows);
            break;
          }
          case "command": {
            // Single command execution within session
            executeCommand({ command: message.command, cwd: session.cwd, timeout: message.timeout ?? 30000 })
              .then((result) => {
                if (ws.readyState === 1) {
                  ws.send(JSON.stringify({
                    type: "command-result",
                    commandId: message.commandId,
                    ...result,
                  }));
                }
              });
            break;
          }
          default:
            break;
        }
      } catch {
        // Ignore invalid messages
      }
    });
  });

  server.on("upgrade", (request: any, socket: any, head: any) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === path) {
      wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        wss.emit("connection", ws, request);
      });
    }
  });
}
