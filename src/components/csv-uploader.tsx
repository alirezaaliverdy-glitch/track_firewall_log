import React from "react";
import { parseCSV } from "@/lib/csv";
import { useLogContext } from "@/context/LogContext";
import { Input } from "./ui/input";

export default function CsvUploader() {
  const { setData } = useLogContext();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
        // automation
      const json = parseCSV(text);
      if (Array.isArray(json)) {
        setData(json);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to parse CSV", err);
    }
  };

  return (
    <div className="py-2">
      <label className="flex items-center gap-2">
        <span className="text-sm">Upload CSV:</span>
        <Input type="file" accept=".csv,text/csv" onChange={onFileChange} />
      </label>
    </div>
  );
}
