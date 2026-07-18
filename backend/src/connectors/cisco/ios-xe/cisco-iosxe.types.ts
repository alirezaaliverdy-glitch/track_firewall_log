export type CiscoIosXeParsedBundle = {
  platform: unknown;
  interfaces: unknown[];
  vlans: unknown[];
  etherchannels: unknown[];
  accessLists: unknown[];
};

export type CiscoConnectionStage = "input" | "dns" | "tcp" | "ssh_negotiation" | "authentication" | "shell" | "prompt" | "privilege" | "command" | "platform_detection";
export type CiscoConnectionSemantic = "connected_supported" | "connected_unsupported" | "connection_failed";
export type CiscoSshCompatibilityProfile = "modern" | "legacy_cisco";

export type CiscoConnectorDiagnostic = {
  code: string;
  stage: CiscoConnectionStage;
  retryable: boolean;
  connectorInvoked: boolean;
  transportConnected: boolean;
  authenticated: boolean;
  shellOpened: boolean;
  userMessage: string;
  remediation: string[];
  compatibilityProfile: CiscoSshCompatibilityProfile;
};

export type CiscoConnectionEvidence = {
  semantic: CiscoConnectionSemantic;
  diagnostic: CiscoConnectorDiagnostic;
  promptMode: "user" | "privileged";
  compatibilityProfile: CiscoSshCompatibilityProfile;
};
