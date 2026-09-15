import type { VendorCustomCommandPolicy } from "./custom-command-policy.types.js";
import { baseDecision, vendorText } from "./shared.js";

function commandAllowed(command: string) {
  if (!command.startsWith("/")) return false;
  if (/\/system\s+(reset-configuration|reboot)|\/user\b|\/certificate\b|export\s+show-sensitive|password|remove\s+\[find\]|disable\s+\[find\]/i.test(command)) return false;
  return /^\/(system identity|system ntp|ip service|ip firewall|interface|ip address|ip route)\b/i.test(command);
}

export const mikrotikCustomCommandPolicy: VendorCustomCommandPolicy = {
  vendor: "mikrotik",
  supportsDevice(device) {
    const text = vendorText(device);
    return device?.protocol === "ssh" && (text.includes("mikrotik") || text.includes("routeros"));
  },
  parse(input) {
    return baseDecision({ ...input, vendor: "mikrotik", commandAllowed, fallbackOperation: "mikrotik_custom_command" }).normalizedOperation;
  },
  evaluate(input) {
    return baseDecision({ ...input, vendor: "mikrotik", commandAllowed, fallbackOperation: "mikrotik_custom_command" });
  },
};
