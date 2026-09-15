import http from "node:http";
import tls from "node:tls";
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

type ProviderRequest = {
  signal: AbortSignal;
  headers: Record<string, string>;
  body: string;
};

function requestThroughHttpProxy(url: string, input: ProviderRequest): Promise<Response> {
  const target = new URL(url);
  const proxy = new URL(env.openaiProxyUrl ?? "");
  if (target.protocol !== "https:" || proxy.protocol !== "http:") {
    throw new Error("OPENAI_PROXY_URL must be an http:// proxy for an https:// AI endpoint");
  }

  return new Promise((resolve, reject) => {
    const targetPort = Number(target.port || 443);
    const connectHeaders: Record<string, string> = {
      Host: `${target.hostname}:${targetPort}`
    };
    if (proxy.username || proxy.password) {
      const credentials = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
      connectHeaders["Proxy-Authorization"] = `Basic ${Buffer.from(credentials).toString("base64")}`;
    }

    const connectRequest = http.request({
      hostname: proxy.hostname,
      port: Number(proxy.port || 80),
      method: "CONNECT",
      path: `${target.hostname}:${targetPort}`,
      headers: connectHeaders,
      signal: input.signal
    });

    connectRequest.once("connect", (connectResponse, socket, head) => {
      if (connectResponse.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`AI proxy CONNECT failed with status ${connectResponse.statusCode ?? 502}`));
        return;
      }
      if (head.length > 0) socket.unshift(head);

      const secureSocket = tls.connect({ socket, servername: target.hostname });
      secureSocket.once("secureConnect", () => {
        const agent = new http.Agent({ keepAlive: false });
        agent.createConnection = () => secureSocket;
        const providerRequest = http.request({
          hostname: target.hostname,
          port: targetPort,
          path: `${target.pathname}${target.search}`,
          method: "POST",
          headers: input.headers,
          signal: input.signal,
          agent
        }, (providerResponse) => {
          const chunks: Buffer[] = [];
          providerResponse.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          providerResponse.once("end", () => {
            agent.destroy();
            resolve(new Response(Buffer.concat(chunks), {
              status: providerResponse.statusCode ?? 502,
              headers: providerResponse.headers as HeadersInit
            }));
          });
        });
        providerRequest.once("error", reject);
        providerRequest.end(input.body);
      });
      secureSocket.once("error", reject);
    });
    connectRequest.once("error", reject);
    connectRequest.end();
  });
}

function requestDirectly(url: string, input: ProviderRequest) {
  return fetch(url, {
    method: "POST",
    signal: input.signal,
    headers: input.headers,
    body: input.body
  });
}

async function sendProviderRequest(url: string, input: ProviderRequest) {
  if (!env.openaiProxyUrl) return requestDirectly(url, input);
  try {
    return await requestThroughHttpProxy(url, input);
  } catch (error) {
    if (input.signal.aborted) throw error;
    return requestDirectly(url, input);
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
    const promptContext = {
      ...input.context,
      assistantMode: input.mode ?? "action",
      selectedConversationContext: {
        vendor: input.selectedVendor ?? null,
        connectorType: input.selectedConnectorType ?? null,
        deviceName: input.selectedDeviceName ?? null
      }
    };
    const conversationMessages = input.mode === "chat"
      ? (input.conversationHistory ?? []).map((item) => ({ role: item.role, content: item.content }))
      : [];
    const requestBody = JSON.stringify({
      model,
      temperature: input.mode === "chat" ? 0.35 : 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSecurityOrchestratorSystemPrompt(promptContext) },
        ...conversationMessages,
        {
          role: "user",
          content: JSON.stringify({
            userMessage: input.message,
            evidencePack: input.context.evidencePack,
            availableActionHints: input.context.evidencePack.availableActionHints
          })
        }
      ]
    });
    const request = () => sendProviderRequest(url, {
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Length": String(Buffer.byteLength(requestBody)),
        Authorization: `Bearer ${env.openaiApiKey}`,
        "HTTP-Referer": "http://localhost/firewall/",
        "X-Title": "Firewall Log Analyzer"
      },
      body: requestBody
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
