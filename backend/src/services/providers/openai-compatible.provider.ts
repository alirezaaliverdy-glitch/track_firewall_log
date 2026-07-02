import { env } from "../../config/env.js";
import type { AiProviderInput, StructuredAiResponse } from "../ai-provider.service.js";
import { buildSecurityOrchestratorSystemPrompt } from "../../ai/prompts/security-orchestrator-system-prompt.js";

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
          { role: "system", content: buildSecurityOrchestratorSystemPrompt(input.context) },
          {
            role: "user",
            content: JSON.stringify({
              userMessage: input.message,
              evidencePack: input.context.evidencePack,
              availableActionHints: input.context.evidencePack.availableActionHints
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
