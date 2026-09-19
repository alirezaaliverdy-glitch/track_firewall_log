import { AiIntentType, AiRiskLevel } from "@prisma/client";
import type { StructuredAiIntent, StructuredAiResponse, AiProviderInput } from "../ai-provider.service.js";
import { parseAiIntent } from "../ai-intent.service.js";

function topSourceIp(input: AiProviderInput) {
  const events = input.context.evidencePack.recentHighCriticalEvents;
  return Array.isArray(events) ? String((events[0] as Record<string, unknown> | undefined)?.srcIp ?? "") || null : null;
}

function openIncidentCount(input: AiProviderInput) {
  return input.context.incidents.countByStatus.find((entry) => entry.status === "open")?.count ?? 0;
}

function highIncidentCount(input: AiProviderInput) {
  return input.context.incidents.countBySeverity.find((entry) => entry.severity === "high")?.count ?? 0;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function deterministicChatResponse(input: AiProviderInput, persian: boolean): StructuredAiResponse {
  const target = objectValue(input.context.targetDeviceContext);
  const device = objectValue(target.device);
  const connection = objectValue(target.connectionState);
  const inventory = objectValue(target.inventory);
  const vendor = String(device.vendor ?? input.selectedVendor ?? (persian ? "نامشخص" : "unknown"));
  const name = String(device.name ?? input.selectedDeviceName ?? (persian ? "دستگاه انتخابی" : "selected device"));
  const platform = String(device.platform ?? device.type ?? (persian ? "نامشخص" : "unknown"));
  const status = String(connection.status ?? (persian ? "نامشخص" : "unknown"));
  const model = inventory.model ? String(inventory.model) : null;
  const historyAware = (input.conversationHistory?.length ?? 0) > 0;
  const observed = `${input.context.events.recentCount} recent events, ${openIncidentCount(input)} open incidents, ${highIncidentCount(input)} high-severity incidents`;

  return {
    assistantMessage: persian
      ? `${historyAware ? "در ادامه همین گفتگو، " : ""}دید کلی من درباره «${name}» بر پایه اطلاعات ثبت‌شده این است: وندور ${vendor}، پلتفرم ${platform}${model ? `، مدل ${model}` : ""} و وضعیت اتصال ${status} است. در داده فعلی ${input.context.events.recentCount} رخداد اخیر، ${openIncidentCount(input)} رخداد باز و ${highIncidentCount(input)} رخداد با شدت بالا دیده می‌شود. می‌توانیم درباره معماری، تنظیمات امن، عیب‌یابی یا ریسک‌های همین وندور مرحله‌به‌مرحله گفت‌وگو کنیم؛ اگر منظورتان بخش مشخصی مثل فایروال، SSH، سرویس‌ها یا لاگ‌هاست همان را بگویید تا دقیق‌تر ادامه بدهم.`
      : `${historyAware ? "Continuing this conversation, " : ""}my current view of ${name} is based on the registered context: vendor ${vendor}, platform ${platform}${model ? `, model ${model}` : ""}, connection status ${status}, and ${observed}. We can continue with architecture, hardening, troubleshooting, services, or logs for this vendor.`,
    shouldCreateIntent: false,
    intent: null,
    confidence: 0.68
  };
}

function looksLikePersianEgressRequest(message: string) {
  return message.includes("اینترنت") && (message.includes("اداری") || message.includes("اجازه") || message.includes("خروج"));
}

export async function runMockAiProvider(input: AiProviderInput): Promise<StructuredAiResponse> {
  const persian = /[\u0600-\u06ff]/.test(input.message);

  if (input.mode === "chat") return deterministicChatResponse(input, persian);

  const parsed = parseAiIntent(input.message);

  if (parsed && parsed.intentType !== AiIntentType.explain_security_status) {
    const parsedMissingFields = Array.isArray(parsed.parameters.missingFields) ? parsed.parameters.missingFields.map(String) : [];
    const parsedQuestions = Array.isArray(parsed.parameters.clarificationQuestions) ? parsed.parameters.clarificationQuestions.map(String) : [];
    const policyMissing = parsed.intentType === AiIntentType.create_egress_policy
      ? ["deviceId", ...(!("sourceIp" in parsed.parameters) && !("sourceCidr" in parsed.parameters) ? ["sourceIp"] : []), "srcInterface", "dstInterface", "services", "exact schedule"]
      : parsedMissingFields;
    return {
      assistantMessage: persian
        ? `درخواست شما به‌عنوان عملیات پیشنهادی ${parsed.intentType} شناسایی شد. این درخواست مستقیم اجرا نمی‌شود و فقط وارد مسیر کنترل‌شده بازبینی می‌شود. ${parsed.explanation}`
        : `I understood this as a proposed ${parsed.intentType} request. I will not execute it. ${parsed.explanation}`,
      shouldCreateIntent: true,
      intent: {
        intentType: parsed.intentType,
        vendor: (String(parsed.parameters.vendor ?? "unknown") === "linux_edge" ? "linux" : String(parsed.parameters.vendor ?? "unknown")) as StructuredAiIntent["vendor"],
        riskLevel: parsed.riskLevel,
        targetDeviceHint: null,
        parameters: parsed.parameters,
        missingFields: policyMissing,
        clarificationQuestions: parsed.intentType === AiIntentType.create_egress_policy
          ? [
              "Which registered device should receive this policy?",
              "Which source IP or CIDR should be limited?",
              "Which source and destination interfaces should be used?",
              "Which services should be allowed during business hours?"
            ]
          : parsedQuestions,
        executionSupport: String(parsed.parameters.executionSupport ?? "catalog_executable") as "catalog_executable",
        destructive: Boolean(parsed.parameters.destructive),
        requiresExplicitReview: Boolean(parsed.parameters.requiresExplicitReview),
        expectedImpact: String(parsed.parameters.expectedImpact ?? ""),
        suggestedPrechecks: Array.isArray(parsed.parameters.suggestedPrechecks) ? parsed.parameters.suggestedPrechecks.map(String) : [],
        suggestedVerification: Array.isArray(parsed.parameters.suggestedVerification) ? parsed.parameters.suggestedVerification.map(String) : [],
        suggestedRollback: Array.isArray(parsed.parameters.suggestedRollback) ? parsed.parameters.suggestedRollback.map(String) : [],
        explanation: parsed.explanation
      },
      confidence: 0.86
    };
  }

  if (looksLikePersianEgressRequest(input.message)) {
    return {
      assistantMessage: "I understood this as an egress policy request. I will only propose a structured intent; no device action will run.",
      shouldCreateIntent: true,
      intent: {
        intentType: AiIntentType.create_egress_policy,
        vendor: "unknown",
        riskLevel: AiRiskLevel.high,
        targetDeviceHint: null,
        parameters: {
          destination: "internet",
          scheduleName: "business_hours",
          action: "allow",
          nat: true,
          log: true
        },
        missingFields: ["deviceId", "sourceIp", "srcInterface", "dstInterface", "services", "exact schedule"],
        clarificationQuestions: [
          "Which registered device should receive this policy?",
          "Which source IP or CIDR should be limited?",
          "Which source and destination interfaces should be used?",
          "Which services should be allowed during business hours?"
        ],
        executionSupport: "needs_parameters",
        destructive: false,
        requiresExplicitReview: false,
        expectedImpact: "Creates or changes outbound firewall access for the selected source.",
        suggestedPrechecks: [],
        suggestedVerification: [],
        suggestedRollback: [],
        explanation: "Creating an egress policy requires explicit device, interfaces, source, services, controlled planning, and rollback metadata."
      },
      confidence: 0.82
    };
  }

  const topIp = topSourceIp(input);
  return {
    assistantMessage: persian
      ? `خلاصه فعلی امنیت: ${input.context.events.recentCount} رخداد اخیر، ${openIncidentCount(input)} رخداد باز و ${highIncidentCount(input)} رخداد با شدت بالا ثبت شده است. ` +
        `${topIp ? `پرتکرارترین IP اخیر ${topIp} است. ` : ""}` +
        "می‌توانم یافته‌ها را توضیح دهم یا یک عملیات ساختاریافته و قابل بازبینی آماده کنم؛ تغییر مستقیم روی تجهیزات انجام نمی‌دهم."
      : `Current security summary: ${input.context.events.recentCount} recent events, ${openIncidentCount(input)} open incidents, ` +
        `${highIncidentCount(input)} high-severity incidents. ` +
        `${topIp ? `Top recent source IP is ${topIp}. ` : ""}` +
        "I can explain findings or prepare structured action intents, but I cannot execute firewall changes.",
    shouldCreateIntent: false,
    intent: null,
    confidence: 0.75
  };
}
