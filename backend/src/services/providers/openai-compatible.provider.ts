import { env } from "../../config/env.js";
import type { AiProviderInput, StructuredAiResponse } from "../ai-provider.service.js";

export class AiProviderRequestError extends Error {
  statusCode: number;
  provider: string;
  model: string;

  constructor(input: { statusCode: number; provider: string; model: string; message: string }) {
    super(input.message);
    this.name = "AiProviderRequestError";
    this.statusCode = input.statusCode;
    this.provider = input.provider;
    this.model = input.model;
  }
}

function extractJson(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function systemPrompt() {
  return [
    "You are a security assistant for a firewall/SIEM/SOAR dashboard.",
    "You must never execute commands, generate free-form shell for execution, SSH, or change devices.",
    "Return only valid JSON matching this exact schema:",
    '{"assistantMessage":"string","shouldCreateIntent":boolean,"intent":{"intentType":"string","riskLevel":"low|medium|high|critical","targetDeviceHint":string|null,"parameters":{},"missingFields":[],"clarificationQuestions":[],"explanation":"string"}|null,"confidence":number}',
    "Supported intentType values: explain_security_status, create_egress_policy, block_source_ip_temporary, unblock_source_ip, open_port, close_port, change_ssh_port, create_address_object, create_schedule_object, create_service_object, add_firewall_rule, remove_firewall_rule, enable_rule, disable_rule, mikrotik_add_address_list_entry, mikrotik_remove_address_list_entry, mikrotik_block_ip_temporary, mikrotik_create_managed_drop_rule, mikrotik_enable_managed_rule, mikrotik_disable_managed_rule, mikrotik_add_comment_to_rule, mikrotik_read_firewall_summary, mikrotik_create_filter_rule, mikrotik_enable_filter_rule, mikrotik_disable_filter_rule, mikrotik_move_filter_rule, mikrotik_set_filter_rule_comment, mikrotik_remove_managed_filter_rule, mikrotik_list_filter_rules, mikrotik_search_filter_rules, mikrotik_create_dstnat_rule, mikrotik_create_srcnat_masquerade_rule, mikrotik_enable_nat_rule, mikrotik_disable_nat_rule, mikrotik_set_nat_rule_comment, mikrotik_remove_managed_nat_rule, mikrotik_list_nat_rules, mikrotik_unblock_ip, mikrotik_list_address_list, mikrotik_create_managed_blocklist_rule, mikrotik_list_ip_services, mikrotik_disable_unused_service, mikrotik_restrict_service_by_address, mikrotik_change_service_port, mikrotik_enable_service, mikrotik_disable_service, mikrotik_list_interfaces, mikrotik_enable_interface, mikrotik_disable_interface, mikrotik_set_interface_comment, mikrotik_detect_wan_lan_candidates, mikrotik_list_routes, mikrotik_add_static_route, mikrotik_disable_static_route, mikrotik_remove_managed_static_route, mikrotik_show_dns_settings, mikrotik_set_dns_servers, mikrotik_list_dhcp_servers, mikrotik_list_dhcp_leases, mikrotik_add_static_dhcp_lease, mikrotik_remove_static_dhcp_lease, mikrotik_create_backup, mikrotik_create_export_sanitized, mikrotik_set_identity, mikrotik_show_clock, mikrotik_show_logs, mikrotik_show_resources, mikrotik_reboot, mikrotik_schedule_reboot, mikrotik_disable_rule_by_id, mikrotik_remove_rule_by_id, unknown.",
    "For MikroTik, never output raw RouterOS CLI. Use only the mikrotik_* catalog intent types and structured parameters such as address, listName, timeout, chain, ruleId, or comment.",
    "For MikroTik reboot or scheduled reboot, use mikrotik_reboot or mikrotik_schedule_reboot only when the user explicitly asks; these are critical break-glass intents. Block reset, user, certificate, show-sensitive export, SSH service changes, SSH port changes, remove all, disable all, and raw command requests with intentType unknown.",
    "For action requests, set shouldCreateIntent=true and provide structured parameters only.",
    "For questions or summaries, set shouldCreateIntent=false unless a concrete device action is requested.",
    "Never guess firewall interfaces. Put missing deviceId, srcInterface, dstInterface, services, exact schedule, or sourceIp into missingFields when unknown.",
    "Do not include credentials, secrets, raw logs, or executable free-form commands."
  ].join("\n");
}

function providerLabel() {
  return env.aiProvider === "openai" ? "openai" : "openai_compatible";
}

function errorDetail(payload: unknown) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const error = source.error;
  if (error && typeof error === "object") {
    const errorSource = error as Record<string, unknown>;
    const message = typeof errorSource.message === "string" ? errorSource.message : JSON.stringify(errorSource);
    const code = typeof errorSource.code === "string" ? ` (${errorSource.code})` : "";
    return `${message}${code}`;
  }
  if (typeof source.message === "string") return source.message;
  return JSON.stringify(payload).slice(0, 500);
}

async function parseProviderPayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

export function retryAfterMilliseconds(value: string | null, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1000, 5000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.min(date - now, 5000)) : 0;
}

export async function runOpenAiCompatibleProvider(input: AiProviderInput, model = env.openaiModel): Promise<StructuredAiResponse> {
  if (!env.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.aiTimeoutMs);
  const url = `${env.openaiBaseUrl.replace(/\/$/, "")}/chat/completions`;

  try {
    const request = () => fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openaiApiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt() },
          {
            role: "user",
            content: JSON.stringify({
              userMessage: input.message,
              safeSecurityContext: input.context
            })
          }
        ]
      })
    });
    let response = await request();
    if (response.status === 429) {
      const delay = retryAfterMilliseconds(response.headers.get("Retry-After"));
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      response = await request();
    }

    const payload = await parseProviderPayload(response);
    if (!response.ok) {
      throw new AiProviderRequestError({
        statusCode: response.status,
        provider: providerLabel(),
        model,
        message: `AI provider error ${response.status} for ${model}: ${errorDetail(payload)}`
      });
    }

    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = typeof message?.content === "string" ? message.content : "";
    if (!content) throw new Error("AI provider returned an empty message");

    return JSON.parse(extractJson(content)) as StructuredAiResponse;
  } finally {
    clearTimeout(timeout);
  }
}
