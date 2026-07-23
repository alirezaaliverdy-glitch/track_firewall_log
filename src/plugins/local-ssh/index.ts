import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type SshAuthMode = "password" | "private_key";

export type HostKeyProbeOptions = {
  host: string;
  port: number;
};

export type HostKeyResult = {
  host: string;
  port: number;
  algorithm: string;
  sha256Fingerprint: string;
};

export type SshConnectionOptions = {
  host: string;
  port: number;
  username: string;
  credentialRef: string;
  authMode: SshAuthMode;
  trustedHostKeySha256: string;
  connectTimeoutMs: number;
  commandTimeoutMs: number;
  legacyAlgorithmsAllowed?: boolean;
};

export type SshExecuteOptions = SshConnectionOptions & {
  executionId: string;
  commands: Array<{ id: string; command: string; timeoutMs: number; readOnly: boolean }>;
  maxOutputBytes: number;
};

export type SshConnectionResult = {
  connected: boolean;
  hostKeyVerified: boolean;
  platform?: string;
  message?: string;
};

export type SshExecutionStart = {
  executionId: string;
  startedAt: string;
};

export type SshExecutionEvent = {
  executionId: string;
  type: "started" | "stdout" | "stderr" | "step_succeeded" | "step_failed" | "completed" | "cancelled";
  stepId?: string;
  data?: string;
  exitCode?: number;
  message?: string;
  createdAt: string;
};

export interface LocalSshPlugin {
  getHostKey(options: HostKeyProbeOptions): Promise<HostKeyResult>;
  testConnection(options: SshConnectionOptions): Promise<SshConnectionResult>;
  execute(options: SshExecuteOptions): Promise<SshExecutionStart>;
  cancel(options: { executionId: string }): Promise<void>;
  addListener(eventName: "sshExecutionEvent", listener: (event: SshExecutionEvent) => void): Promise<PluginListenerHandle>;
}

export const LocalSsh = registerPlugin<LocalSshPlugin>("LocalSsh");
