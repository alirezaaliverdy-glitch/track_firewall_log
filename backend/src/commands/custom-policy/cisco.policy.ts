import type { VendorCustomCommandPolicy } from "./custom-command-policy.types.js";
import { baseDecision, vendorText } from "./shared.js";

function commandAllowed(command: string) {
  if (/^(reload|erase|delete|format|copy|write erase)\b|password|secret|enable secret|username\s+\S+\s+secret/i.test(command)) return false;
  return /^(show|configure terminal|interface\s+\S+|line\s+vty\s+\d+(?:\s+\d+)?|description\s+.+|shutdown|no shutdown|switchport\b.+|ip address\b.+|transport input ssh|end|exit)\b/i.test(command);
}

export const ciscoCustomCommandPolicy: VendorCustomCommandPolicy = {
  vendor: "cisco",
  supportsDevice(device) {
    return device?.protocol === "ssh" && vendorText(device).includes("cisco");
  },
  parse(input) {
    return baseDecision({ ...input, vendor: "cisco", commandAllowed, requiredPermission: "actions.custom.cisco", fallbackOperation: "cisco_custom_command" }).normalizedOperation;
  },
  evaluate(input) {
    return baseDecision({ ...input, vendor: "cisco", commandAllowed, requiredPermission: "actions.custom.cisco", fallbackOperation: "cisco_custom_command" });
  },
};
