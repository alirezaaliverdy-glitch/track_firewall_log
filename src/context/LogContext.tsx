import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import { logData } from "@/lib/logData";

export type LogContextType = {
  search: string;
  setSearch: (s: string) => void;
  filteredData: typeof logData;
};

const LogContext = createContext<LogContextType | undefined>(undefined);

export function useLogContext() {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error("useLogContext must be used within LogProvider");
  return ctx;
}

export function LogProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState("");
  const filteredData = useMemo(() => {
    if (!search) return logData;
    const lowerSearch = search.toLowerCase();
    return logData.filter((row) =>
      Object.values(row).some((val) =>
        String(val).toLowerCase().includes(lowerSearch)
      )
    );
  }, [search]);

  return (
    <LogContext.Provider value={{ search, setSearch, filteredData }}>
      {children}
    </LogContext.Provider>
  );
}
