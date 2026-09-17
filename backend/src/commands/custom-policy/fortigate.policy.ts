import type { VendorCustomCommandPolicy } from "./custom-command-policy.types.js";
import { baseDecision, vendorText } from "./shared.js";

function commandAllowed(command: string) {
  if (/execute\s+(reboot|shutdown|factoryreset)|diagnose\s+debug|delete\s+\*|purge|unset\s+password|set\s+password/i.test(command)) return false;
  return /^(config|edit|set|next|end|show|get)\b/i.test(command);
}

export const fortigateCustomCommandPolicy: VendorCustomCommandPolicy = {
  vendor: "fortigate",
  supportsDevice(device) {
    return device?.protocol === "ssh" && vendorText(device).includes("forti");
  },
  parse(input) {
    return baseDecision({ ...input, vendor: "fortigate", commandAllowed, fallbackOperation: "fortigate_custom_command" }).normalizedOperation;
  },
  evaluate(input) {
    return baseDecision({ ...input, vendor: "fortigate", commandAllowed, fallbackOperation: "fortigate_custom_command" });
  },
};
