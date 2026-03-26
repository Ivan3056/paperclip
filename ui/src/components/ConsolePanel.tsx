import { useEffect, useRef, useState, useCallback } from "react";
import { X, Minus, Square, Terminal as TerminalIcon, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConsolePanel } from "../context/ConsoleContext";
import { consoleApi, type TerminalSession } from "../api/console";
import { cn } from "@/lib/utils";

interface LogEntry {
  type: "stdout" | "stderr" | "system" | "input" | "exit";
  data: string;
  timestamp: number;
}

export function ConsolePanel() {
  const { isConsoleOpen, isConsoleMinimized, toggleConsole, toggleMinimize, closeConsole } =
    useConsolePanel();

  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [command, setCommand] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [cwd, setCwd] = useState("/");

  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logs, scrollToBottom]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = consoleApi.createWebSocket();

      ws.onopen = () => {
        setIsConnected(true);
        ws.send(JSON.stringify({ type: "init", shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash" }));
        addLog("system", "Connected to terminal");
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          switch (message.type) {
            case "init":
              setActiveSessionId(message.sessionId);
              break;
            case "stdout":
              setLogs((prev) => [...prev, { type: "stdout", data: message.data, timestamp: Date.now() }]);
              break;
            case "stderr":
              setLogs((prev) => [...prev, { type: "stderr", data: message.data, timestamp: Date.now() }]);
              break;
            case "exit":
              setIsConnected(false);
              setLogs((prev) => [
                ...prev,
                {
                  type: "exit",
                  data: `Process exited with code ${message.code ?? "null"}${message.signal ? ` (signal: ${message.signal})` : ""}`,
                  timestamp: Date.now(),
                },
              ]);
              break;
            case "error":
              setLogs((prev) => [...prev, { type: "stderr", data: message.message, timestamp: Date.now() }]);
              break;
            case "command-result":
              if (message.stdout) {
                setLogs((prev) => [...prev, { type: "stdout", data: message.stdout, timestamp: Date.now() }]);
              }
              if (message.stderr) {
                setLogs((prev) => [...prev, { type: "stderr", data: message.stderr, timestamp: Date.now() }]);
              }
              break;
            default:
              break;
          }
        } catch {
          // Ignore invalid messages
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        addLog("system", "Disconnected from terminal");
      };

      ws.onerror = () => {
        setIsConnected(false);
        addLog("system", "WebSocket error");
      };

      wsRef.current = ws;
    } catch (err) {
      addLog("system", `Failed to connect: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setActiveSessionId(null);
  }, []);

  const addLog = useCallback((type: LogEntry["type"], data: string) => {
    setLogs((prev) => [...prev, { type, data, timestamp: Date.now() }]);
  }, []);

  const executeCommand = useCallback(() => {
    if (!command.trim()) return;

    addLog("input", `> ${command}`);
    const cmdToExecute = command;
    setCommand("");

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "command",
        command: cmdToExecute,
        commandId: `cmd_${Date.now()}`,
        timeout: 30000,
      }));
    } else {
      // Fallback to HTTP API
      consoleApi.execute({ command: cmdToExecute, timeout: 30000 })
        .then((result) => {
          if (result.stdout) {
            addLog("stdout", result.stdout);
          }
          if (result.stderr) {
            addLog("stderr", result.stderr);
          }
          if (result.exitCode !== null) {
            addLog("exit", `Exit code: ${result.exitCode}`);
          }
        })
        .catch((err) => {
          addLog("stderr", `Error: ${err instanceof Error ? err.message : String(err)}`);
        });
    }
  }, [command, addLog]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      executeCommand();
    }
  }, [executeCommand]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const copyLogs = useCallback(() => {
    const text = logs.map((log) => log.data).join("\n");
    navigator.clipboard.writeText(text);
  }, [logs]);

  useEffect(() => {
    if (isConsoleOpen && !isConsoleMinimized && !wsRef.current) {
      connect();
    }
    return () => {
      if (!isConsoleOpen) {
        disconnect();
      }
    };
  }, [isConsoleOpen, isConsoleMinimized, connect, disconnect]);

  useEffect(() => {
    if (isConsoleOpen && !isConsoleMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isConsoleOpen, isConsoleMinimized]);

  if (!isConsoleOpen) return null;

  if (isConsoleMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={toggleMinimize}
          className="h-10 w-10 rounded-full shadow-lg bg-terminal-bg hover:bg-terminal-bg/80"
          size="icon"
        >
          <TerminalIcon className="h-5 w-5 text-terminal-fg" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 w-[800px] h-[500px] z-50 flex flex-col bg-terminal-bg border border-border shadow-2xl rounded-tl-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-terminal-header border-b border-border">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-terminal-fg/70" />
          <span className="text-xs font-medium text-terminal-fg/90">Terminal</span>
          <span className={cn(
            "text-xs px-1.5 py-0.5 rounded",
            isConnected ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
          )}>
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearLogs}
            className="h-7 w-7 text-terminal-fg/70 hover:text-terminal-fg"
            title="Clear"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={copyLogs}
            className="h-7 w-7 text-terminal-fg/70 hover:text-terminal-fg"
            title="Copy"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleMinimize}
            className="h-7 w-7 text-terminal-fg/70 hover:text-terminal-fg"
            title="Minimize"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={closeConsole}
            className="h-7 w-7 text-terminal-fg/70 hover:text-red-400"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Terminal Output */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5 bg-terminal-bg">
        {logs.length === 0 && (
          <div className="text-terminal-fg/40">
            <p>Terminal connected. Type a command and press Enter.</p>
            <p className="mt-1">Try: <code className="bg-terminal-fg/10 px-1 rounded">ls</code>, <code className="bg-terminal-fg/10 px-1 rounded">pwd</code>, <code className="bg-terminal-fg/10 px-1 rounded">node --version</code></p>
          </div>
        )}
        {logs.map((log, index) => (
          <div
            key={index}
            className={cn(
              "whitespace-pre-wrap break-all",
              log.type === "stdout" && "text-terminal-fg",
              log.type === "stderr" && "text-red-400",
              log.type === "system" && "text-terminal-fg/50 italic",
              log.type === "input" && "text-blue-400 font-semibold",
              log.type === "exit" && "text-terminal-fg/60"
            )}
          >
            {log.data}
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 bg-terminal-input border-t border-border">
        <span className="text-terminal-fg/60 font-mono text-xs">{cwd}</span>
        <span className="text-terminal-fg/40 font-mono text-xs">{'>'}</span>
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? "Type a command..." : "Connecting..."}
          disabled={!isConnected}
          className="flex-1 bg-transparent border-none outline-none font-mono text-xs text-terminal-fg placeholder:text-terminal-fg/30"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        <Button
          onClick={executeCommand}
          disabled={!command.trim() || !isConnected}
          size="icon-sm"
          className="h-7 w-7 bg-terminal-fg/10 hover:bg-terminal-fg/20 text-terminal-fg"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
