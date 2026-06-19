import { Shield } from "lucide-react";
import { useLogContext } from "@/context/LogContext";
import type { FirewallTypeSelection } from "@/types/log";

const FIREWALL_OPTIONS: { value: FirewallTypeSelection; label: string }[] = [
  { value: "auto", label: "Auto Detect" },
  { value: "fortigate", label: "FortiGate" },
  { value: "mikrotik", label: "MikroTik" },
  { value: "pfsense", label: "pfSense" },
  { value: "ciscoasa", label: "Cisco ASA" },
  { value: "paloalto", label: "Palo Alto" },
  { value: "ubiquiti", label: "Ubiquiti / UniFi" },
  { value: "generic", label: "Generic" },
];

export default function FirewallTypeSelector() {
  const { firewallType, setFirewallType, detectedVendor } = useLogContext();
  const selectedLabel =
    FIREWALL_OPTIONS.find((option) => option.value === firewallType)?.label ?? "Auto Detect";

  return (
    <div className="mb-3 rounded-lg border border-blue-900/50 bg-zinc-900 p-4 shadow-[inset_0_1px_0_rgba(59,130,246,0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-blue-700/60 bg-blue-950/50 text-blue-300">
            <Shield className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <label htmlFor="firewall-type" className="block text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Firewall Type
            </label>
            <p className="text-sm text-zinc-200">
              {selectedLabel}
              {firewallType === "auto" && detectedVendor !== "unknown" && (
                <span className="ml-2 rounded border border-blue-900/60 bg-blue-950/30 px-1.5 py-0.5 text-xs text-blue-300">
                  Detected: {detectedVendor}
                </span>
              )}
            </p>
          </div>
        </div>

        <select
          id="firewall-type"
          value={firewallType}
          onChange={(event) => setFirewallType(event.target.value as FirewallTypeSelection)}
          className="h-10 min-w-[220px] rounded-md border border-zinc-600 bg-zinc-950 px-3 text-sm font-medium text-zinc-100 outline-none transition-colors hover:border-blue-700/70 focus:border-blue-500 focus:ring-2 focus:ring-blue-600/40"
          aria-label="Firewall Type"
        >
          {FIREWALL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
