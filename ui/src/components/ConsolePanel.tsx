import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Terminal, Send, X, Maximize2, Minimize2, Trash2, History } from "lucide-react";
import { useConsole } from "../hooks/useConsole";
import { useCompany } from "../context/CompanyContext";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useLiveUpdates } from "../context/LiveUpdatesProvider";

interface ConsolePanelProps {
  isOpen: boolean;
  onClose: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

interface LogEntryProps {
  log: {
    command: string;
    output: string | null;
    exitCode: number | null;
    isError: boolean;
    startedAt: string;
  };
  index: number;
}

function LogEntry({ log, index }: LogEntryProps) {
  const time = new Date(log.startedAt).toLocaleTimeString();

  return (
    <div className="border-b border-border/50 last:border-0">
      {/* Command */}
      {log.command && (
        <div className="flex items-center gap-2 px-3 py-2 bg-accent/30">
          <span className="text-xs font-mono text-muted-foreground shrink-0">{time}</span>
          <span className="text-xs font-semibold text-foreground shrink-0">$</span>
          <code className="text-xs font-mono text-foreground flex-1 break-all">{log.command}</code>
          {log.exitCode !== null && (
            <span
              className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
                log.exitCode === 0
                  ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                  : "bg-red-500/20 text-red-700 dark:text-red-300",
              )}
            >
              Exit: {log.exitCode}
            </span>
          )}
        </div>
      )}

      {/* Output */}
      {log.output && (
        <div
          className={cn(
            "px-3 py-2",
            log.isError && "bg-red-500/5",
          )}
        >
          <pre
            className={cn(
              "text-xs font-mono whitespace-pre-wrap break-words",
              log.isError
                ? "text-red-600 dark:text-red-400"
                : "text-foreground/80",
            )}
          >
            {log.output}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ConsolePanel({ isOpen, onClose, isMinimized, onToggleMinimize }: ConsolePanelProps) {
  const { selectedCompanyId } = useCompany();
  const console = useConsole(selectedCompanyId);
  const [command, setCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [console.logs]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const trimmedCommand = command.trim();
    if (!trimmedCommand || console.isExecuting) return;

    // Add to history
    setCommandHistory((prev) => [...prev, trimmedCommand].slice(-100)); // Keep last 100 commands
    setHistoryIndex(-1);

    // Handle special commands
    if (trimmedCommand === "clear") {
      console.closeSession();
      setTimeout(() => console.createSession(), 100);
      setCommand("");
      return;
    }

    if (trimmedCommand === "help") {
      console.executeCommand("echo 'Available commands:\\n  clear - Clear console\\n  help - Show this help\\n  history - Show command history\\n  pwd - Print working directory\\n  ls - List files\\n  cd <dir> - Change directory'");
      setCommand("");
      return;
    }

    if (trimmedCommand === "history") {
      const historyOutput = commandHistory.length > 0
        ? commandHistory.map((cmd, i) => `  ${i + 1}. ${cmd}`).join("\n")
        : "No command history";
      console.executeCommand(`echo "${historyOutput}"`);
      setCommand("");
      return;
    }

    // Handle cd command specially
    if (trimmedCommand.startsWith("cd ")) {
      const targetDir = trimmedCommand.slice(3).trim();
      // Execute cd and get new path
      const result = await console.executeCommand(`cd ${targetDir} && pwd`);
      if (result && result.exitCode === 0) {
        const newPath = result.output.trim();
        await console.updateCwd(newPath);
      }
      setCommand("");
      return;
    }

    await console.executeCommand(trimmedCommand);
    setCommand("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCommand(commandHistory[newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setCommand("");
        } else {
          setHistoryIndex(newIndex);
          setCommand(commandHistory[newIndex]);
        }
      }
    } else if (e.key === "Enter") {
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  const isInitializing = console.isLoading || !console.session;

  return (
    <div
      className={cn(
        "fixed bottom-0 right-0 bg-background border border-border shadow-2xl flex flex-col transition-all duration-200 z-50",
        isMinimized
          ? "w-80 h-12"
          : "w-[600px] h-[500px]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-accent/50">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-foreground" />
          <span className="text-sm font-semibold text-foreground">Console</span>
          {console.session?.cwd && !isMinimized && (
            <span className="text-xs text-muted-foreground font-mono ml-2">
              {console.session.cwd}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onToggleMinimize && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onToggleMinimize}
              className="text-muted-foreground"
            >
              {isMinimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Logs */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div ref={scrollRef} className="px-2 py-2 space-y-1">
                {isInitializing ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    Initializing console...
                  </div>
                ) : console.logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                    <Terminal className="h-8 w-8 opacity-50" />
                    <p className="text-sm">Console is ready</p>
                    <p className="text-xs">Type a command and press Enter</p>
                  </div>
                ) : (
                  console.logs.map((log, index) => (
                    <LogEntry key={log.id} log={log} index={index} />
                  ))
                )}
              </div>
              <ScrollBar orientation="vertical" />
            </ScrollArea>
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-border p-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground shrink-0">$</span>
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={console.isExecuting ? "Executing..." : "Enter command..."}
                disabled={console.isExecuting || isInitializing}
                className="flex-1 bg-transparent text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground/50"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
              <Button
                type="submit"
                variant="ghost"
                size="icon-xs"
                disabled={console.isExecuting || isInitializing || !command.trim()}
                className="text-muted-foreground hover:text-foreground"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </form>
        </>
      )}

      {isMinimized && (
        <div
          className="flex-1 flex items-center px-3 text-xs text-muted-foreground cursor-pointer"
          onClick={onToggleMinimize}
        >
          {console.isExecuting ? (
            <span className="animate-pulse">Executing...</span>
          ) : (
            <span>Click to expand</span>
          )}
        </div>
      )}
    </div>
  );
}
