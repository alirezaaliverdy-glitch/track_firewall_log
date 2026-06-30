import { ActionType, AiIntentType } from "@prisma/client";
import { VENDOR_COMMAND_CATALOG, type CatalogVendor, type CommandCatalogEntry } from "./catalog/index.js";
import type { ParsedIntent } from "../services/ai-intent.service.js";

const DIGITS: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"
};

export type CatalogIntentMatch = {
  status: "matched" | "unsupported" | "needs_ai_classification";
  confidence: number;
  catalogEntry: CommandCatalogEntry | null;
  parsedIntent: ParsedIntent | null;
  normalizedText: string;
  aiRequired: boolean;
  message?: string;
};

export function normalizeCommandText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[۰-۹٠-٩]/g, (digit) => DIGITS[digit] ?? digit)
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .toLowerCase()
    .replace(/[,:;!?؟]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function vendorFromText(text: string): CatalogVendor | null {
  if (/\b(mikrotik|routeros|router os)\b|میکروتیک/.test(text)) return "mikrotik";
  if (/\b(fortigate|fortinet|fortios|forti)\b|فورتی/.test(text)) return "fortigate";
  if (/\b(linux|ubuntu|debian|centos|rhel)\b|لینوکس/.test(text)) return "linux";
  if (/\b(pfsense|pf sense)\b/.test(text)) return "pfsense";
  if (/\b(cisco|ios xe|nx-os)\b|سیسکو/.test(text)) return "cisco";
  return null;
}

function aliasScore(text: string, entry: CommandCatalogEntry) {
  let best = 0;
  for (const rawAlias of [...entry.aliases, ...entry.faAliases]) {
    const alias = normalizeCommandText(rawAlias);
    if (!alias) continue;
    if (text.includes(alias)) best = Math.max(best, alias.split(" ").length > 1 ? 0.96 : 0.82);
    else {
      const tokens = alias.split(" ").filter((token) => token.length > 1);
      const hits = tokens.filter((token) => text.includes(token)).length;
      if (tokens.length > 0) best = Math.max(best, (hits / tokens.length) * 0.78);
    }
  }
  return best;
}

function addresses(text: string) {
  return Array.from(text.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/(?:[0-9]|[12][0-9]|3[0-2]))?\b/g)).map((match) => match[0]);
}

function ports(text: string, ips: string[]) {
  const withoutIps = ips.reduce((current, ip) => current.replace(ip, " "), text);
  return Array.from(withoutIps.matchAll(/\b\d{1,5}\b/g)).map((match) => Number(match[0])).filter((port) => port >= 1 && port <= 65535);
}

function extractedParameters(entry: CommandCatalogEntry, text: string) {
  const ips = addresses(text);
  const foundPorts = ports(text, ips);
  const parameters: Record<string, unknown> = { vendor: entry.vendor, targetDeviceHint: entry.vendor };

  if (entry.id === "mikrotik.change_service_port") {
    parameters.serviceName = text.includes("ssh") ? "ssh" : text.includes("www") ? "www" : "ssh";
    parameters.service = parameters.serviceName;
    if (foundPorts[0]) parameters.newPort = foundPorts[0];
    if (ips[0]) parameters.trustedSourceCidr = ips[0];
  } else if (entry.id === "mikrotik.temporary_block_ip" || entry.id.includes("address_list_item")) {
    if (ips[0]) {
      parameters.address = ips[0];
      if (ips[0].includes("/")) parameters.sourceCidr = ips[0];
      else parameters.sourceIp = ips[0];
    }
    parameters.listName = "ai_blocklist";
    parameters.timeout = text.match(/\b\d+[mhdw]\b/)?.[0] ?? "10m";
  } else if (entry.id === "mikrotik.add_port_forward") {
    if (foundPorts[0]) parameters.dstPort = foundPorts[0];
    if (ips[0]) parameters.toAddress = ips[0];
    parameters.toPort = foundPorts[1] ?? foundPorts[0];
    parameters.protocol = text.includes("udp") ? "udp" : "tcp";
  } else if (entry.id === "fortigate.create_address_object") {
    const value = ips[0];
    if (value) {
      parameters.name = `addr_${value.replace(/[./]/g, "_")}`;
      parameters.addressObjectName = parameters.name;
      if (value.includes("/")) parameters.sourceCidr = value;
      else parameters.sourceIp = value;
    }
  } else if (entry.id === "fortigate.create_vip") {
    const mappedIp = ips.length > 1 ? ips[1] : ips[0];
    if (ips.length > 1) parameters.externalIp = ips[0];
    if (mappedIp) parameters.mappedIp = mappedIp;
    const port = foundPorts[0] ?? 443;
    parameters.externalPort = port;
    parameters.mappedPort = foundPorts[1] ?? port;
    if (mappedIp) parameters.name = `vip_${mappedIp.replace(/\./g, "_")}_${port}`;
  } else if (entry.id === "fortigate.create_firewall_policy") {
    const interfaceMatch = text.match(/\bfrom\s+([a-z0-9_.:-]+)\s+to\s+([a-z0-9_.:-]+)\b/);
    if (interfaceMatch) {
      parameters.srcInterface = interfaceMatch[1];
      parameters.dstInterface = interfaceMatch[2];
    }
    if (ips[0]) parameters.sourceIp = ips[0];
    const services = Array.from(text.matchAll(/\b(https|http|ssh|dns|all)\b/g)).map((match) => match[1].toUpperCase());
    parameters.services = Array.from(new Set(services.length ? services : ["ALL"]));
    parameters.schedule = "always";
    parameters.action = /\b(deny|block)\b/.test(text) ? "deny" : "accept";
    parameters.nat = /\bnat\b/.test(text);
    parameters.logTraffic = /\b(log|logging)\b/.test(text);
    parameters.disabled = true;
    parameters.name = "firewall-log-analyzer-policy";
  } else if (entry.vendor === "linux") {
    if (foundPorts[0]) parameters.port = foundPorts[0];
    if (ips[0]) {
      parameters.sourceIp = ips[0];
      parameters.srcIp = ips[0];
    }
    parameters.protocol = text.includes("udp") ? "udp" : "tcp";
    parameters.serviceName = text.match(/\b(nginx|apache2?|httpd|ssh|sshd|ufw|docker|postgresql|mysql|redis)\b/)?.[0] ?? "system";
  }

  return parameters;
}

function parsedFromEntry(entry: CommandCatalogEntry, parameters: Record<string, unknown>): ParsedIntent | null {
  if (!Object.values(ActionType).includes(entry.actionType as ActionType) || !Object.values(AiIntentType).includes(entry.actionType as AiIntentType)) return null;
  return {
    intentType: entry.actionType as AiIntentType,
    riskLevel: entry.risk,
    parameters,
    explanation: `${entry.title} matched the controlled ${entry.vendor} command catalog. No raw command was accepted.`
  };
}

export function routeCatalogIntent(message: string, vendorHint?: CatalogVendor | null): CatalogIntentMatch {
  const normalizedText = normalizeCommandText(message);
  if (/\b(raw\s+(?:command|cli)|execute\s+command|run\s+command)\b/i.test(message) || /[|;&`]\s*(?:sh|bash|powershell|cmd)?/i.test(message)) {
    return {
      status: "unsupported",
      confidence: 1,
      catalogEntry: null,
      parsedIntent: null,
      normalizedText,
      aiRequired: false,
      message: "Raw commands cannot be executed. Choose a controlled catalog action."
    };
  }
  const vendor = vendorHint ?? vendorFromText(normalizedText);
  const candidates = VENDOR_COMMAND_CATALOG.filter((entry) => !vendor || entry.vendor === vendor);
  const ranked = candidates
    .map((entry) => ({ entry, score: aliasScore(normalizedText, entry) + (vendor && entry.vendor === vendor ? 0.03 : 0) }))
    .sort((left, right) => right.score - left.score);
  const winner = ranked[0];
  if (!winner || winner.score < 0.8) {
    return { status: "needs_ai_classification", confidence: winner?.score ?? 0, catalogEntry: null, parsedIntent: null, normalizedText, aiRequired: true };
  }
  if (!winner.entry.supported) {
    return { status: "unsupported", confidence: Math.min(winner.score, 1), catalogEntry: winner.entry, parsedIntent: null, normalizedText, aiRequired: false, message: "This action is not in the controlled catalog yet." };
  }
  const parsedIntent = parsedFromEntry(winner.entry, extractedParameters(winner.entry, normalizedText));
  if (!parsedIntent) {
    return { status: "unsupported", confidence: Math.min(winner.score, 1), catalogEntry: winner.entry, parsedIntent: null, normalizedText, aiRequired: false, message: "This action is not in the controlled catalog yet." };
  }
  return { status: "matched", confidence: Math.min(winner.score, 1), catalogEntry: winner.entry, parsedIntent, normalizedText, aiRequired: false };
}
