import { AiIntentType, AiRiskLevel } from "@prisma/client";
import type { StructuredAiResponse, AiProviderInput } from "../ai-provider.service.js";
import { parseAiIntent } from "../ai-intent.service.js";

function topSourceIp(input: AiProviderInput) {
  return input.context.events.topSourceIps[0]?.srcIp ?? null;
}

function openIncidentCount(input: AiProviderInput) {
  return input.context.incidents.countByStatus.find((entry) => entry.status === "open")?.count ?? 0;
}

function highIncidentCount(input: AiProviderInput) {
  return input.context.incidents.countBySeverity.find((entry) => entry.severity === "high")?.count ?? 0;
}

function looksLikePersianEgressRequest(message: string) {
  return message.includes("اینترنت") && (message.includes("اداری") || message.includes("اجازه") || message.includes("خروج"));
}

export async function runMockAiProvider(input: AiProviderInput): Promise<StructuredAiResponse> {
  const parsed = parseAiIntent(input.message);

  if (parsed && parsed.intentType !== AiIntentType.explain_security_status) {
    const parsedMissingFields = Array.isArray(parsed.parameters.missingFields) ? parsed.parameters.missingFields.map(String) : [];
    const parsedQuestions = Array.isArray(parsed.parameters.clarificationQuestions) ? parsed.parameters.clarificationQuestions.map(String) : [];
    const policyMissing = parsed.intentType === AiIntentType.create_egress_policy
      ? ["deviceId", ...(!("sourceIp" in parsed.parameters) && !("sourceCidr" in parsed.parameters) ? ["sourceIp"] : []), "srcInterface", "dstInterface", "services", "exact schedule"]
      : parsedMissingFields;
    return {
      assistantMessage: `I understood this as a proposed ${parsed.intentType} request. I will not execute it. ${parsed.explanation}`,
      shouldCreateIntent: true,
      intent: {
        intentType: parsed.intentType,
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
        explanation: "Creating an egress policy requires explicit device, interfaces, source, services, controlled planning, and rollback metadata."
      },
      confidence: 0.82
    };
  }

  const topIp = topSourceIp(input);
  return {
    assistantMessage:
      `Current security summary: ${input.context.events.recentCount} recent events, ${openIncidentCount(input)} open incidents, ` +
      `${highIncidentCount(input)} high-severity incidents. ` +
      `${topIp ? `Top recent source IP is ${topIp}. ` : ""}` +
      "I can explain findings or prepare structured action intents, but I cannot execute firewall changes.",
    shouldCreateIntent: false,
    intent: null,
    confidence: 0.75
  };
}
