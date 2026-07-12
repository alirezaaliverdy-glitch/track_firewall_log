export type ImplementationState = "implemented" | "partial" | "planned" | "unsupported";
export type CapabilityMode = "read" | "mutate";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export type VendorDefinition = { key: string; titleFa: string; titleEn: string; description: string; implementationState: ImplementationState; connectorTypes: string[] };
export type PlatformDefinition = { key: string; vendorKey: string; titleFa: string; titleEn: string; family: string; implementationState: ImplementationState; executable: boolean; notes: string[] };
export type PlatformDetectionResult = { vendor: string; platform: string; version: string | null; model: string | null; hostname: string | null; confidence: number; evidence: string[]; supported: boolean };
export type CapabilityDefinition = {
  key: string; titleFa: string; titleEn: string; vendorKey: string; platformKeys: string[]; domain: string; mode: CapabilityMode; risk: RiskLevel; permission: string; connectorTypes: string[]; supportedVersions: string; requiredFacts: string[]; inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown>; preflightTemplate: string | null; actionTemplate: string | null; verificationTemplate: string | null; rollbackSupport: "not_applicable" | "available" | "planned" | "unsupported"; implementationState: ImplementationState; sourceRefs: string[]; parserVersion: string; fixtureRefs: string[];
};
export type CapabilitySupport = { capabilityKey: string; state: ImplementationState; supported: boolean; executable: boolean; reason: string; evidence: string[] };
