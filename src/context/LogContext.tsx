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
  filteredData: Array<Record<string, string | number>>;
  setData: (d: Array<Record<string, string | number>>) => void;
};

const LogContext = createContext<LogContextType | undefined>(undefined);

export function useLogContext() {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error("useLogContext must be used within LogProvider");
  return ctx;
}

export function LogProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Array<Record<string, string | number>>>(
    logData
  );

  const filteredData = useMemo(() => {
    if (!search) return data;
    const lowerSearch = search.toLowerCase();
    return data.filter((row) =>
      Object.values(row).some((val) =>
        String(val).toLowerCase().includes(lowerSearch)
      )
    );
  }, [search, data]);

  return (
    <LogContext.Provider value={{ search, setSearch, filteredData, setData }}>
      {children}
    </LogContext.Provider>
  );
}
