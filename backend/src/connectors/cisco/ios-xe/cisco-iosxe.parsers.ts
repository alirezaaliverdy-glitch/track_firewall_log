import type { PlatformDetectionResult } from "../../../vendors/vendor.types.js";

const lineValue = (text: string, pattern: RegExp) => text.match(pattern)?.[1]?.trim() ?? null;

export function detectCiscoPlatform(showVersionOutput: string): PlatformDetectionResult {
  const text = showVersionOutput.replace(/\r/g, "");
  const evidence: string[] = [];
  const lower = text.toLowerCase();
  const version = lineValue(text, /Cisco IOS XE Software, Version\s+([^\n]+)/i) ?? lineValue(text, /Version\s+([0-9][^,\n\s]+)/i);
  const model = lineValue(text, /Model Number\s*:\s*([^\n]+)/i) ?? lineValue(text, /cisco\s+(\S+)\s+\([^\n]+\)\s+processor/i);
  const hostname = lineValue(text, /^([^\s#>]+) uptime is /im);
  let platform = "cisco-unknown";
  let confidence = 20;
  if (lower.includes("ios-xe") || lower.includes("ios xe") || lower.includes("cisco ios xe software")) { platform = "cisco-ios-xe"; confidence = 90; evidence.push("show version contains IOS-XE marker"); }
  else if (lower.includes("nx-os")) { platform = "cisco-nx-os"; confidence = 90; evidence.push("show version contains NX-OS marker"); }
  else if (lower.includes("ios xr")) { platform = "cisco-ios-xr"; confidence = 90; evidence.push("show version contains IOS XR marker"); }
  else if (lower.includes("adaptive security appliance") || lower.includes("asa software")) { platform = "cisco-asa"; confidence = 90; evidence.push("show version contains ASA marker"); }
  else if (lower.includes("firepower threat defense")) { platform = "cisco-ftd"; confidence = 90; evidence.push("show version contains FTD marker"); }
  else if (lower.includes("cisco ios software")) { platform = "cisco-ios-classic"; confidence = 70; evidence.push("show version contains classic IOS marker"); }
  if (version) evidence.push(`version=${version}`);
  if (model) evidence.push(`model=${model}`);
  return { vendor: "cisco", platform, version, model, hostname, confidence, evidence, supported: platform === "cisco-ios-xe" && confidence >= 80 };
}

export function parseCiscoInterfacesStatus(output: string) {
  return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[A-Za-z]+[\w/.-]+\s+/.test(line) && !/^Port\s+/i.test(line)).map((line) => {
    const parts = line.split(/\s{2,}|\t+/).filter(Boolean);
    const [name = "unknown", nameOrStatus = "", statusMaybe = ""] = parts;
    const status = /connected|notconnect|disabled|err-disabled|inactive/i.test(nameOrStatus) ? nameOrStatus : statusMaybe;
    return { name, status: status || "unknown", raw: line };
  });
}

export function parseCiscoVlans(output: string) {
  return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\d+\s+/.test(line)).map((line) => {
    const match = line.match(/^(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/);
    return { vlanId: Number(match?.[1] ?? 0), name: match?.[2] ?? "unknown", status: match?.[3] ?? "unknown", ports: (match?.[4] ?? "").split(/,\s*/).filter(Boolean), raw: line };
  });
}

export function parseCiscoEtherChannels(output: string) {
  return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\d+\s+\S+\s+\S+/.test(line)).map((line) => {
    const parts = line.split(/\s+/);
    return { group: parts[0], portChannel: parts[1], protocol: parts[2], ports: parts.slice(3), raw: line };
  });
}

export function parseCiscoAccessLists(output: string) {
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => /access list|permit|deny/i.test(line)).map((line) => ({ raw: line, action: line.match(/\b(permit|deny)\b/i)?.[1]?.toLowerCase() ?? "summary" }));
}
