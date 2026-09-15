import { useState, useMemo } from "react";
import { ChevronDown, RotateCcw, CheckCircle, AlertTriangle, Info } from "lucide-react";
import { useLogContext } from "@/context/LogContext";
import { detectColumnMapping } from "@/lib/columnMapping";
import { getAllPresets } from "@/lib/vendorPresets";
import {
  FIELD_LABELS,
  IMPORTANT_FIELDS,
  TIMESTAMP_FIELDS,
  type MappableField,
  type ColumnMapping,
} from "@/types/mapping";
import type { FirewallVendor } from "@/types/log";

// ---------------------------------------------------------------------------
// Wizard sections: which fields are shown in which group
// ---------------------------------------------------------------------------

const WIZARD_SECTIONS: { label: string; fields: MappableField[] }[] = [
  {
    label: "Identity & Time",
    fields: ["timestamp", "date", "time"],
  },
  {
    label: "Network (required for detections)",
    fields: ["srcIp", "dstIp", "srcPort", "dstPort", "protocol", "action"],
  },
  {
    label: "Traffic Volume",
    fields: ["bytes", "bytesSent", "bytesReceived", "packets", "packetsSent", "packetsReceived"],
  },
  {
    label: "Policy & Application",
    fields: ["service", "application", "ruleName", "user", "message"],
  },
  {
    label: "NAT",
    fields: ["natSrcPort", "natDstPort"],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOT_MAPPED_VALUE = "__none__";
const IMPORTANT_SET = new Set<MappableField>(IMPORTANT_FIELDS);
const TIMESTAMP_SET = new Set<MappableField>(TIMESTAMP_FIELDS);

function confidenceColor(score: number): string {
  if (score >= 75) return "text-green-400";
  if (score >= 40) return "text-yellow-400";
  return "text-red-400";
}

// ---------------------------------------------------------------------------
// Single field row
// ---------------------------------------------------------------------------

function FieldRow({
  field,
  headers,
  mapping,
  onChange,
}: {
  field: MappableField;
  headers: string[];
  mapping: ColumnMapping;
  onChange: (field: MappableField, value: string | undefined) => void;
}) {
  const mapped = mapping[field];
  const isImportant = IMPORTANT_SET.has(field);
  const isTimestamp = TIMESTAMP_SET.has(field);
  const isMapped = mapped !== undefined;

  return (
    <div className="flex items-center gap-3 py-2 border-b border-zinc-700/40 last:border-0">
      {/* Field label */}
      <div className="w-36 flex-shrink-0">
        <span
          className={`text-xs ${isImportant ? "text-zinc-200 font-medium" : "text-zinc-400"}`}
        >
          {FIELD_LABELS[field]}
        </span>
        {isImportant && (
          <span className="ml-1.5 text-[9px] text-zinc-500 uppercase tracking-wide">
            important
          </span>
        )}
        {isTimestamp && !isImportant && (
          <span className="ml-1.5 text-[9px] text-zinc-600 uppercase tracking-wide">
            time
          </span>
        )}
      </div>

      {/* Dropdown */}
      <div className="relative flex-1">
        <select
          value={mapped ?? NOT_MAPPED_VALUE}
          onChange={(e) => {
            const v = e.target.value;
            onChange(field, v === NOT_MAPPED_VALUE ? undefined : v);
          }}
          className="w-full appearance-none rounded-md bg-zinc-800 border border-zinc-600 text-xs text-zinc-200 px-2.5 py-1.5 pr-7 focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500 transition-colors"
          aria-label={`Map ${FIELD_LABELS[field]} to CSV column`}
        >
          <option value={NOT_MAPPED_VALUE} className="text-zinc-500">
            — Not mapped —
          </option>
          {headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <ChevronDown
          className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none"
          aria-hidden="true"
        />
      </div>

      {/* Status icon */}
      <div className="w-4 flex-shrink-0">
        {isMapped ? (
          <CheckCircle
            className="w-3.5 h-3.5 text-green-500"
            aria-label="Mapped"
          />
        ) : isImportant ? (
          <AlertTriangle
            className="w-3.5 h-3.5 text-yellow-500"
            aria-label="Important field not mapped"
          />
        ) : (
          <span className="block w-3.5 h-3.5" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function Section({
  label,
  fields,
  headers,
  mapping,
  onChange,
  defaultOpen,
}: {
  label: string;
  fields: MappableField[];
  headers: string[];
  mapping: ColumnMapping;
  onChange: (field: MappableField, value: string | undefined) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const mappedCount = fields.filter((f) => mapping[f] !== undefined).length;

  return (
    <div className="border border-zinc-700/50 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-xs font-medium text-zinc-300">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500">
            {mappedCount}/{fields.length} mapped
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </div>
      </button>
      {open && (
        <div className="px-4 bg-zinc-900/60">
          {fields.map((field) => (
            <FieldRow
              key={field}
              field={field}
              headers={headers}
              mapping={mapping}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard component
// ---------------------------------------------------------------------------

export default function ColumnMappingWizard() {
  const {
    csvHeaders,
    columnMapping,
    setColumnMapping,
    vendorPreset,
    setVendorPreset,
    mappingConfidence,
    missingMappings,
    summary,
    detectedVendor,
  } = useLogContext();

  const [localMapping, setLocalMapping] = useState<ColumnMapping>(() => ({ ...columnMapping }));
  const [isDirty, setIsDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const presets = useMemo(() => getAllPresets(), []);

  // Don't render until data is loaded
  if (summary.total === 0 || csvHeaders.length === 0) return null;

  // ---- Handlers ----

  const handleFieldChange = (field: MappableField, value: string | undefined) => {
    setLocalMapping((prev) => {
      const next = { ...prev };
      if (value === undefined) {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
    setIsDirty(true);
  };

  const handleVendorChange = (vendor: FirewallVendor) => {
    setVendorPreset(vendor);
    const preset = presets.find((p) => p.vendor === vendor);
    if (preset) {
      // Merge preset mapping with auto-detection so unspecified fields still resolve
      const autoMapping = detectColumnMapping(csvHeaders);
      const merged: ColumnMapping = { ...autoMapping, ...preset.mapping };
      setLocalMapping(merged);
      setIsDirty(true);
    }
  };

  const handleApply = () => {
    setColumnMapping(localMapping);
    setIsDirty(false);
  };

  const handleReset = () => {
    const auto = detectColumnMapping(csvHeaders);
    setLocalMapping(auto);
    setColumnMapping(auto);
    setIsDirty(false);
  };

  // ---- Derived display values ----

  // Use live context confidence for the saved mapping, local for the preview
  const previewConfidence = (() => {
    const mapped = IMPORTANT_FIELDS.filter((f) => localMapping[f] !== undefined);
    const hasTs = TIMESTAMP_FIELDS.some((f) => localMapping[f] !== undefined);
    const score = Math.round(
      (IMPORTANT_FIELDS.length > 0
        ? (mapped.length / IMPORTANT_FIELDS.length) * 80
        : 80) + (hasTs ? 20 : 0)
    );
    return { score };
  })();

  const displayScore = isDirty ? previewConfidence.score : mappingConfidence.score;
  const currentPreset = presets.find((p) => p.vendor === vendorPreset);

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900 mb-4 overflow-hidden">
      {/* Summary Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-3.5 border-b border-zinc-700/60 hover:bg-zinc-800/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-widest">
            Column Mapping
          </h3>
          {missingMappings.length > 0 && (
            <span className="flex items-center gap-1.5 text-yellow-400 text-xs font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              {missingMappings.length} Important Fields Missing
            </span>
          )}
        </div>

        {/* Right side summary */}
        <div className="flex items-center gap-3">
          {detectedVendor && (
            <span className="text-xs text-zinc-400">
              Vendor: <span className="font-medium">{currentPreset?.name ?? detectedVendor}</span>
            </span>
          )}
          <span className="text-xs text-zinc-400">
            Confidence: <span className={`font-medium ${confidenceColor(displayScore)}`}>{displayScore}%</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {expanded && (
        <div className="p-5 space-y-4">
          {/* Vendor preset selector */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[11px] text-zinc-400 mb-1.5">
                Vendor Preset
              </label>
              <div className="relative">
                <select
                  value={vendorPreset}
                  onChange={(e) => handleVendorChange(e.target.value as FirewallVendor)}
                  className="w-full appearance-none rounded-md bg-zinc-800 border border-zinc-600 text-xs text-zinc-200 px-2.5 py-2 pr-7 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors"
                  aria-label="Select vendor preset"
                >
                  {presets.map((p) => (
                    <option key={p.vendor} value={p.vendor}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none"
                  aria-hidden="true"
                />
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">
                {currentPreset?.description ?? ""}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pb-0.5">
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-600 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                title="Reset to auto-detected mapping"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                Auto-detect
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!isDirty}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-blue-600 bg-blue-700 text-white hover:bg-blue-600"
                title="Apply mapping and re-run analysis"
              >
                <CheckCircle className="w-3 h-3" aria-hidden="true" />
                Apply Mapping
              </button>
            </div>
          </div>

          {/* Missing important fields warning */}
          {missingMappings.length > 0 && !isDirty && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-700/50 bg-yellow-950/30 px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-yellow-300">
                Map Source IP and Destination IP to improve scan and attacker detection.
              </p>
            </div>
          )}

          {isDirty && (
            <div className="flex items-center gap-2 rounded-md border border-blue-700/50 bg-blue-950/30 px-3 py-2">
              <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" aria-hidden="true" />
              <p className="text-xs text-blue-300">
                Unsaved changes. Click{" "}
                <span className="font-semibold">Apply Mapping</span> to re-run analysis.
              </p>
            </div>
          )}

          {/* Available headers info */}
          <p className="text-[10px] text-zinc-600">
            {csvHeaders.length} column{csvHeaders.length !== 1 ? "s" : ""} detected in CSV:{" "}
            <span className="text-zinc-500">{csvHeaders.slice(0, 8).join(", ")}</span>
            {csvHeaders.length > 8 && (
              <span className="text-zinc-600"> +{csvHeaders.length - 8} more</span>
            )}
          </p>

          {/* Field mapping sections */}
          <div className="space-y-2">
            {WIZARD_SECTIONS.map((section, i) => (
              <Section
                key={section.label}
                label={section.label}
                fields={section.fields}
                headers={csvHeaders}
                mapping={localMapping}
                onChange={handleFieldChange}
                defaultOpen={i < 2} // first two sections open by default
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
