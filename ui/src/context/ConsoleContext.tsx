import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ConsoleContextValue {
  isConsoleOpen: boolean;
  isConsoleMinimized: boolean;
  openConsole: () => void;
  closeConsole: () => void;
  toggleConsole: () => void;
  toggleMinimize: () => void;
}

const ConsoleContext = createContext<ConsoleContextValue | undefined>(undefined);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isConsoleMinimized, setIsConsoleMinimized] = useState(false);

  const openConsole = useCallback(() => {
    setIsConsoleOpen(true);
    setIsConsoleMinimized(false);
  }, []);

  const closeConsole = useCallback(() => {
    setIsConsoleOpen(false);
    setIsConsoleMinimized(false);
  }, []);

  const toggleConsole = useCallback(() => {
    setIsConsoleOpen((prev) => !prev);
    setIsConsoleMinimized(false);
  }, []);

  const toggleMinimize = useCallback(() => {
    setIsConsoleMinimized((prev) => !prev);
  }, []);

  return (
    <ConsoleContext.Provider
      value={{
        isConsoleOpen,
        isConsoleMinimized,
        openConsole,
        closeConsole,
        toggleConsole,
        toggleMinimize,
      }}
    >
      {children}
    </ConsoleContext.Provider>
  );
}

export function useConsolePanel() {
  const context = useContext(ConsoleContext);
  if (context === undefined) {
    throw new Error("useConsolePanel must be used within a ConsoleProvider");
  }
  return context;
}
