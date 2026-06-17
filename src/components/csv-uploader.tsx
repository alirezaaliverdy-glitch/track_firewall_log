import React, { useRef, useState } from "react";
import { parseCSV } from "@/lib/csv";
import { useLogContext } from "@/context/LogContext";
import { Input } from "./ui/input";

const ACCEPTED_MIME = ["text/csv", "application/vnd.ms-excel", "application/csv"];

function isCsvFile(file: File): boolean {
  // Accept by extension (.csv) or by MIME type
  const byExt = file.name.toLowerCase().endsWith(".csv");
  const byMime = ACCEPTED_MIME.includes(file.type);
  return byExt || byMime;
}

export default function CsvUploader() {
  const { setData } = useLogContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type before reading
    if (!isCsvFile(file)) {
      setError("Only CSV files are accepted.");
      // Reset the input so the same file can be re-selected after fixing
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== "string") {
        setError("Failed to read file.");
        return;
      }

      const { rows, errors } = parseCSV(text);

      if (rows.length === 0) {
        setError(
          errors.length > 0
            ? `CSV parsed with errors and no valid rows. First error: ${errors[0].message}`
            : "The CSV file appears to be empty or has no data rows."
        );
        return;
      }

      // Log parse warnings to console for debugging — never shown to users as raw values
      if (errors.length > 0) {
        console.warn(`CSV parsed with ${errors.length} non-fatal error(s):`, errors);
      }

      setData(rows);
    };

    reader.onerror = () => {
      setError("An error occurred while reading the file.");
    };

    // Read fully client-side — no server upload
    reader.readAsText(file);
  };

  return (
    <div className="py-2">
      <label className="flex items-center gap-2">
        <span className="text-sm">Upload CSV:</span>
        <Input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,application/vnd.ms-excel"
          onChange={onFileChange}
        />
      </label>
      {error && (
        <p className="mt-1 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
