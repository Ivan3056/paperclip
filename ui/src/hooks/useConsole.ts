import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./client";

export interface ConsoleSession {
  id: string;
  companyId: string;
  cwd: string;
  isActive: boolean;
  createdAt: string;
}

export interface ConsoleLog {
  id: string;
  command: string;
  output: string | null;
  exitCode: number | null;
  isError: boolean;
  startedAt: string;
  completedAt: string | null;
}

export interface ExecuteResult {
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

const WS_RECONNECT_DELAY_MS = 2000;

export function useConsole(companyId: string | null | undefined) {
  const [session, setSession] = useState<ConsoleSession | null>(null);
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  // Create or get session
  const createSession = useCallback(async () => {
    if (!companyId) return null;

    try {
      setIsLoading(true);
      setError(null);

      const response = await api.post<{ session: ConsoleSession }>("/console/session", {
        companyId,
      });

      setSession(response.session);
      return response.session;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create console session";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  // Load logs
  const loadLogs = useCallback(async (sessionId?: string, limit = 50) => {
    const targetSessionId = sessionId ?? session?.id;
    if (!targetSessionId || !companyId) return;

    try {
      const response = await api.get<{ logs: ConsoleLog[] }>(
        `/console/session/${targetSessionId}/logs?companyId=${encodeURIComponent(companyId)}&limit=${limit}`,
      );
      setLogs(response.logs.reverse()); // Show oldest first
    } catch (err) {
      console.error("[useConsole] Failed to load logs:", err);
    }
  }, [companyId, session?.id]);

  // Execute command
  const executeCommand = useCallback(async (command: string): Promise<ExecuteResult | null> => {
    const targetSessionId = session?.id;
    if (!targetSessionId || !companyId) {
      setError("No console session available");
      return null;
    }

    try {
      setIsExecuting(true);
      setError(null);

      const response = await api.post<{ success: boolean; result: ExecuteResult }>(
        `/console/session/${targetSessionId}/execute?companyId=${encodeURIComponent(companyId)}`,
        { command },
      );

      // Refresh logs after execution
      await loadLogs(targetSessionId, 100);

      return response.result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to execute command";
      setError(message);
      return null;
    } finally {
      setIsExecuting(false);
    }
  }, [companyId, session?.id, loadLogs]);

  // Update CWD
  const updateCwd = useCallback(async (cwd: string) => {
    const targetSessionId = session?.id;
    if (!targetSessionId || !companyId) return;

    try {
      await api.post(`/console/session/${targetSessionId}/cwd?companyId=${encodeURIComponent(companyId)}`, {
        cwd,
      });
      setSession((prev) => prev ? { ...prev, cwd } : null);
    } catch (err) {
      console.error("[useConsole] Failed to update CWD:", err);
    }
  }, [companyId, session?.id]);

  // Close session
  const closeSession = useCallback(async () => {
    const targetSessionId = session?.id;
    if (!targetSessionId || !companyId) return;

    try {
      await api.delete(`/console/session/${targetSessionId}?companyId=${encodeURIComponent(companyId)}`);
      setSession(null);
      setLogs([]);
    } catch (err) {
      console.error("[useConsole] Failed to close session:", err);
    }
  }, [companyId, session?.id]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!session?.id || !companyId) return;

    let closed = false;

    const connect = () => {
      if (closed) return;

      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/api/companies/${encodeURIComponent(companyId)}/console/ws?sessionId=${session.id}`;

      try {
        wsRef.current = new WebSocket(url);

        wsRef.current.onopen = () => {
          console.log("[Console] WebSocket connected");
        };

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as ConsoleOutputChunk;
            // Add real-time output to logs
            setLogs((prev) => [
              ...prev,
              {
                id: `live-${Date.now()}`,
                command: "",
                output: data.data,
                exitCode: null,
                isError: data.type === "error" || data.type === "stderr",
                startedAt: data.timestamp,
                completedAt: null,
              },
            ]);
          } catch (err) {
            console.error("[Console] Failed to parse WebSocket message:", err);
          }
        };

        wsRef.current.onerror = () => {
          console.error("[Console] WebSocket error");
        };

        wsRef.current.onclose = () => {
          console.log("[Console] WebSocket closed");
          if (!closed) {
            // Reconnect
            reconnectTimerRef.current = window.setTimeout(connect, WS_RECONNECT_DELAY_MS);
          }
        };
      } catch (err) {
        console.error("[Console] Failed to connect WebSocket:", err);
      }
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, "Console unmount");
        wsRef.current = null;
      }
    };
  }, [companyId, session?.id]);

  // Initialize session on mount
  useEffect(() => {
    if (companyId && !session) {
      createSession();
    }
  }, [companyId, session, createSession]);

  return {
    session,
    logs,
    isLoading,
    error,
    isExecuting,
    executeCommand,
    loadLogs,
    updateCwd,
    closeSession,
    createSession,
  };
}
