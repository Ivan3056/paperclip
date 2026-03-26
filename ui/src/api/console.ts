import { api } from "./client";

export interface ConsoleExecuteRequest {
  command: string;
  cwd?: string;
  timeout?: number;
}

export interface ConsoleExecuteResponse {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  duration: number;
}

export interface TerminalSession {
  id: string;
  cwd: string;
  createdAt: number;
}

export interface TerminalSessionsResponse {
  sessions: TerminalSession[];
}

export const consoleApi = {
  execute: (req: ConsoleExecuteRequest) =>
    api.post<ConsoleExecuteResponse>("/console/execute", req),

  getSessions: () =>
    api.get<TerminalSessionsResponse>("/console/sessions"),

  terminateSession: (sessionId: string) =>
    api.delete<void>(`/console/sessions/${sessionId}`),

  createWebSocket: () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/console/terminal`;
    return new WebSocket(wsUrl);
  },
};
