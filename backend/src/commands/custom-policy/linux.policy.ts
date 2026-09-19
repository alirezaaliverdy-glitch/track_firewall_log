import type { VendorCustomCommandPolicy } from "./custom-command-policy.types.js";
import { baseDecision, LINUX_SHELL_META_PATTERN, vendorText } from "./shared.js";

function commandAllowed(command: string) {
  if (LINUX_SHELL_META_PATTERN.test(command)) return false;
  return /^(sudo -n )?systemctl (restart|reload|start|stop|enable|disable|is-active|is-enabled|status|show) [a-zA-Z0-9_.@:-]+( --no-pager)?$/.test(command) ||
    /^(sudo -n )?ufw (status|allow|deny|delete)\b[A-Za-z0-9_ ./'"-]*$/.test(command) ||
    /^sudo -n useradd -m [a-z_][a-z0-9_.-]{0,31}$/.test(command) ||
    /^sudo -n chpasswd$/.test(command) ||
    /^id [a-z_][a-z0-9_.-]{0,31}$/.test(command);
}

export const linuxCustomCommandPolicy: VendorCustomCommandPolicy = {
  vendor: "linux",
  supportsDevice(device) {
    const text = vendorText(device);
    return device?.protocol === "ssh" && (text.includes("linux_edge") || text.includes("linux"));
  },
  parse(input) {
    return baseDecision({ ...input, vendor: "linux", commandAllowed, fallbackOperation: "linux_custom_command" }).normalizedOperation;
  },
  evaluate(input) {
    return baseDecision({ ...input, vendor: "linux", commandAllowed, fallbackOperation: "linux_custom_command" });
  },
};
