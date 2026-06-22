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
    "Supported intentType values: explain_security_status, create_egress_policy, block_source_ip_temporary, unblock_source_ip, open_port, close_port, change_ssh_port, create_address_object, create_schedule_object, create_service_object, add_firewall_rule, remove_firewall_rule, enable_rule, disable_rule, unknown.",
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

export async function runOpenAiCompatibleProvider(input: AiProviderInput, model = env.openaiModel): Promise<StructuredAiResponse> {
  if (!env.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.aiTimeoutMs);
  const url = `${env.openaiBaseUrl.replace(/\/$/, "")}/chat/completions`;

  try {
    const response = await fetch(url, {
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
