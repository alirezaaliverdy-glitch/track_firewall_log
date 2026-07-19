import { createConnection, type Socket } from "node:net";
import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import { DeviceProtocol, type Device } from "@prisma/client";
import { env } from "../../../config/env.js";
import { detectCiscoPlatform, isSupportedCiscoAutomationPlatform } from "./cisco-iosxe.parsers.js";
import { detectCiscoPrompt, normalizeCiscoTerminalOutput, stripCiscoEchoAndPrompt } from "./cisco-iosxe.prompt.js";
import { ciscoReadCommand, type CiscoReadCommandId } from "./cisco-iosxe.templates.js";
import type { CiscoConnectionEvidence, CiscoConnectionStage, CiscoConnectorDiagnostic, CiscoSshCompatibilityProfile } from "./cisco-iosxe.types.js";

export type CiscoIosXeCommandResult = {
  commandId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
};

export type CiscoCliCommandSpec = { commandId: string; command: string; strict?: boolean; write?: boolean; redactOutput?: boolean };

export function redactCiscoCliOutput(output: string) {
  return output
    .replace(/^(\s*enable\s+(?:secret|password)\s+)(.+)$/gim, "$1[REDACTED]")
    .replace(/^(\s*username\s+\S+\s+(?:privilege\s+\d+\s+)?(?:secret|password)\s+)(.+)$/gim, "$1[REDACTED]")
    .replace(/^(\s*snmp-server\s+community\s+)(\S+)/gim, "$1[REDACTED]")
    .replace(/^(\s*tacacs-server\s+key\s+)(.+)$/gim, "$1[REDACTED]")
    .replace(/^(\s*radius-server\s+key\s+)(.+)$/gim, "$1[REDACTED]")
    .replace(/^(\s*key-string\s+)(.+)$/gim, "$1[REDACTED]")
    .replace(/(password|passphrase|private[-_ ]?key|secret)\s*[=:]\s*\S+/gi, "$1=[REDACTED]");
}
type DiagnosticState = Pick<CiscoConnectorDiagnostic, "connectorInvoked" | "transportConnected" | "authenticated" | "shellOpened" | "compatibilityProfile" | "legacyCompatibilityRequested" | "legacyCompatibilityApplied" | "connectionPhase">;

function initialDiagnosticState(compatibilityProfile: CiscoSshCompatibilityProfile): DiagnosticState {
  return { connectorInvoked: false, transportConnected: false, authenticated: false, shellOpened: false, compatibilityProfile, legacyCompatibilityRequested: compatibilityProfile === "legacy_cisco", legacyCompatibilityApplied: false, connectionPhase: "input" };
}

type ResolvedDeviceCredential = {
  name?: string;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  sudo: boolean;
  enableSecret?: string;
};

const REMEDIATION: Record<CiscoConnectionStage, string[]> = {
  input: ["Select a Cisco SSH device and a stored credential reference."],
  dns: ["Verify the hostname or use the management IP address.", "Verify DNS from the backend host."],
  tcp: ["Verify the management address and SSH port.", "Check routing, ACLs, and the device SSH service."],
  ssh_negotiation: ["Review the device SSH algorithms.", "Enable the explicit legacy Cisco profile only for an audited legacy device."],
  authentication: ["Verify the stored username and password or private key.", "Replace the saved credential if its encryption key changed."],
  shell: ["Verify that the account is allowed to open an interactive CLI shell."],
  prompt: ["Verify that login banners eventually reach a Cisco CLI prompt.", "Remove interactive post-login questions from this account."],
  privilege: ["Store a separate enable secret or grant the account privileged EXEC access."],
  command: ["Verify that the account can run the registered read-only command."],
  platform_detection: ["Use an IOS-XE device for the supported automation path."]
};

export class CiscoConnectorError extends Error {
  readonly code: string;
  readonly stage: CiscoConnectionStage;
  readonly retryable: boolean;
  readonly connectorInvoked: boolean;
  readonly transportConnected: boolean;
  readonly authenticated: boolean;
  readonly shellOpened: boolean;
  readonly userMessage: string;
  readonly remediation: string[];
  readonly compatibilityProfile: CiscoSshCompatibilityProfile;
  readonly legacyCompatibilityRequested: boolean;
  readonly legacyCompatibilityApplied: boolean;
  readonly connectionPhase: CiscoConnectionStage;
  readonly internalCause?: unknown;

  constructor(diagnostic: CiscoConnectorDiagnostic, readonly statusCode = 400, internalCause?: unknown) {
    super(diagnostic.userMessage);
    this.name = "CiscoConnectorError";
    this.code = diagnostic.code;
    this.stage = diagnostic.stage;
    this.retryable = diagnostic.retryable;
    this.connectorInvoked = diagnostic.connectorInvoked;
    this.transportConnected = diagnostic.transportConnected;
    this.authenticated = diagnostic.authenticated;
    this.shellOpened = diagnostic.shellOpened;
    this.userMessage = diagnostic.userMessage;
    this.remediation = diagnostic.remediation;
    this.compatibilityProfile = diagnostic.compatibilityProfile;
    this.legacyCompatibilityRequested = diagnostic.legacyCompatibilityRequested;
    this.legacyCompatibilityApplied = diagnostic.legacyCompatibilityApplied;
    this.connectionPhase = diagnostic.connectionPhase;
    Object.defineProperty(this, "internalCause", { value: internalCause, enumerable: false });
  }

  toDiagnostic(): CiscoConnectorDiagnostic {
    return {
      code: this.code, stage: this.stage, retryable: this.retryable,
      connectorInvoked: this.connectorInvoked, transportConnected: this.transportConnected,
      authenticated: this.authenticated, shellOpened: this.shellOpened,
      userMessage: this.userMessage, remediation: this.remediation,
      compatibilityProfile: this.compatibilityProfile,
      legacyCompatibilityRequested: this.legacyCompatibilityRequested,
      legacyCompatibilityApplied: this.legacyCompatibilityApplied,
      connectionPhase: this.connectionPhase
    };
  }
}

function connectorError(code: string, stage: CiscoConnectionStage, userMessage: string, state: DiagnosticState, statusCode: number, retryable: boolean, internalCause?: unknown) {
  return new CiscoConnectorError({ code, stage, retryable, userMessage, remediation: REMEDIATION[stage], ...state }, statusCode, internalCause);
}

export function isCiscoIosXeSshCandidate(device: Pick<Device, "vendor" | "protocol" | "capabilities">) {
  const vendor = String(device.vendor ?? "").toLowerCase();
  const caps = device.capabilities && typeof device.capabilities === "object" ? JSON.stringify(device.capabilities).toLowerCase() : "";
  return (vendor.includes("cisco") || caps.includes("cisco")) && device.protocol === DeviceProtocol.ssh;
}

export function ciscoCompatibilityProfile(device: Pick<Device, "capabilities">): CiscoSshCompatibilityProfile {
  const capabilities = device.capabilities && typeof device.capabilities === "object" && !Array.isArray(device.capabilities)
    ? device.capabilities as Record<string, unknown> : {};
  return capabilities.sshCompatibilityProfile === "legacy_cisco" ? "legacy_cisco" : "modern";
}

export function ciscoConnectionSemantic(showVersionOutput: string) {
  return isSupportedCiscoAutomationPlatform(detectCiscoPlatform(showVersionOutput).platform) ? "connected_supported" as const : "connected_unsupported" as const;
}

async function resolveDeviceCredential(device: Pick<Device, "credentialId" | "credentialRef" | "capabilities">, profile: CiscoSshCompatibilityProfile) {
  const { resolveCredentialById, resolveCredentialByName } = await import("../../../services/credential.service.js");
  let credential: ResolvedDeviceCredential | null = null;
  if (device.credentialId) {
    credential = await resolveCredentialById(device.credentialId);
  }
  if (!credential && device.credentialRef) {
    credential = await resolveCredentialByName(device.credentialRef);
  }
  if (!credential) throw connectorError("CISCO_SSH_CREDENTIAL_MISSING", "input", "A stored credential reference is required for Cisco SSH.", {
      connectorInvoked: false, transportConnected: false, authenticated: false, shellOpened: false, compatibilityProfile: profile, legacyCompatibilityRequested: profile === "legacy_cisco", legacyCompatibilityApplied: false, connectionPhase: "input"
    }, 400, false);
  const capabilities = device.capabilities && typeof device.capabilities === "object" && !Array.isArray(device.capabilities)
    ? device.capabilities as Record<string, unknown> : {};
  const enableCredentialId = typeof capabilities.enableCredentialId === "string" ? capabilities.enableCredentialId : "";
  if (!enableCredentialId) return credential;
  const enableCredential = await resolveCredentialById(enableCredentialId);
  if (!enableCredential?.password) throw connectorError("CISCO_ENABLE_CREDENTIAL_INVALID", "input", "The selected enable credential is missing or is not a password credential.", {
    connectorInvoked: false, transportConnected: false, authenticated: false, shellOpened: false, compatibilityProfile: profile, legacyCompatibilityRequested: profile === "legacy_cisco", legacyCompatibilityApplied: false, connectionPhase: "input"
  }, 400, false);
  return { ...credential, enableSecret: enableCredential.password } as ResolvedDeviceCredential & { enableSecret: string };
}

export const CISCO_LEGACY_IOS_COMPATIBILITY_PROFILE = {
  key: "legacy_cisco" as const,
  label: "Legacy Cisco IOS Compatibility Profile",
  algorithms: {
    kex: { append: ["diffie-hellman-group14-sha1"], prepend: [], remove: [] },
    serverHostKey: { append: ["ssh-rsa"], prepend: [], remove: [] },
    cipher: { append: ["aes128-cbc", "aes192-cbc", "aes256-cbc", "3des-cbc"], prepend: [], remove: [] },
    hmac: { append: ["hmac-sha1", "hmac-sha1-96"], prepend: [], remove: [] }
  } satisfies NonNullable<ConnectConfig["algorithms"]>
};

export function ciscoConnectConfig(device: Pick<Device, "host" | "managementPort">, credential: ResolvedDeviceCredential, profile: CiscoSshCompatibilityProfile, socket?: Socket): ConnectConfig {
  const config: ConnectConfig = {
    host: device.host, port: device.managementPort, username: credential.username,
    readyTimeout: env.sshHandshakeTimeoutMs, keepaliveInterval: 10_000, keepaliveCountMax: 2,
    tryKeyboard: Boolean(credential.password), sock: socket
  };
  if (credential.password) config.password = credential.password;
  if (credential.privateKey) config.privateKey = credential.privateKey;
  if (credential.passphrase) config.passphrase = credential.passphrase;
  if (profile === "legacy_cisco") config.algorithms = CISCO_LEGACY_IOS_COMPATIBILITY_PROFILE.algorithms;
  return config;
}

function mapSshError(error: unknown, state: DiagnosticState) {
  if (error instanceof CiscoConnectorError) return error;
  const source = error as { level?: string; code?: string; message?: string };
  const message = source?.message ?? "Cisco SSH connection failed.";
  if (source?.code === "ENOTFOUND" || source?.code === "EAI_AGAIN") return connectorError("CISCO_DNS_FAILED", "dns", "The Cisco management hostname could not be resolved.", state, 502, true, error);
  if (source?.code === "ECONNREFUSED") return connectorError("CISCO_TCP_REFUSED", "tcp", "The Cisco SSH port refused the connection.", state, 502, true, error);
  if (source?.code === "ETIMEDOUT" && !state.transportConnected) return connectorError("CISCO_TCP_TIMEOUT", "tcp", "The Cisco management address did not answer on the SSH port.", state, 504, true, error);
  if (source?.level === "client-authentication" || /all configured authentication methods failed|authentication/i.test(message)) {
    return connectorError("CISCO_SSH_AUTH_FAILED", "authentication", "Cisco SSH authentication failed.", state, 401, false, error);
  }
  if (source?.level === "client-handshake" || /handshake|no matching|algorithm/i.test(message)) {
    return connectorError("CISCO_SSH_NEGOTIATION_FAILED", "ssh_negotiation", "Cisco SSH algorithm negotiation failed.", state, 502, false, error);
  }
  if (/timed out|timeout/i.test(message)) return connectorError("CISCO_SSH_NEGOTIATION_TIMEOUT", "ssh_negotiation", "Cisco SSH negotiation timed out.", state, 504, true, error);
  return connectorError("CISCO_SSH_CONNECT_FAILED", "ssh_negotiation", "Cisco SSH negotiation failed.", state, 502, true, error);
}

function openTcpSocket(host: string, port: number, timeoutMs: number) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = createConnection({ host, port });
    const cleanup = () => { socket.off("connect", connected); socket.off("error", failed); socket.off("timeout", timedOut); };
    const connected = () => { cleanup(); socket.setTimeout(0); resolve(socket); };
    const failed = (error: Error) => { cleanup(); socket.destroy(); reject(error); };
    const timedOut = () => { const error = Object.assign(new Error("TCP connection timed out."), { code: "ETIMEDOUT" }); failed(error); };
    socket.setTimeout(timeoutMs);
    socket.once("connect", connected);
    socket.once("error", failed);
    socket.once("timeout", timedOut);
  });
}

type ShellLike = Pick<ClientChannel, "on" | "once" | "off" | "write" | "end" | "close">;

export class CiscoInteractiveSession {
  private prompt: string | null = null;
  private mode: "user" | "privileged" | "unknown" = "unknown";

  constructor(private readonly stream: ShellLike, private readonly state: DiagnosticState, private readonly outputLimitBytes: number, private readonly promptTimeoutMs: number, private readonly commandTimeoutMs: number) {}

  private collectUntil(predicate: (output: string) => boolean, timeoutMs: number, stage: CiscoConnectionStage) {
    return new Promise<string>((resolve, reject) => {
      let output = "";
      let settled = false;
      const finish = (error?: CiscoConnectorError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.stream.off("data", onData);
        this.stream.off("close", onClose);
        if (error) reject(error); else resolve(output);
      };
      const onClose = () => finish(connectorError("CISCO_SHELL_CLOSED", stage, "The Cisco interactive shell closed before the CLI prompt returned.", this.state, 502, true));
      const onData = (chunk: Buffer | string) => {
        output += chunk.toString();
        if (Buffer.byteLength(output, "utf8") > this.outputLimitBytes) return finish(connectorError("CISCO_OUTPUT_LIMIT", stage, "Cisco command output exceeded the safe limit.", this.state, 502, false));
        if (/--More--|<--- More --->/i.test(normalizeCiscoTerminalOutput(output))) {
          this.stream.write(" ");
          output = output.replace(/--More--|<--- More --->/gi, "");
        }
        if (predicate(output)) finish();
      };
      const timer = setTimeout(() => finish(connectorError(stage === "prompt" ? "CISCO_PROMPT_TIMEOUT" : "CISCO_COMMAND_TIMEOUT", stage, stage === "prompt" ? "Cisco CLI prompt was not detected in time." : "Cisco CLI command did not return to the prompt in time.", this.state, 504, true)), timeoutMs);
      this.stream.on("data", onData);
      this.stream.once("close", onClose);
    });
  }

  private hasPrompt(output: string) {
    const detected = detectCiscoPrompt(output);
    if (!detected.prompt || detected.mode === "unknown" || detected.mode === "config") return false;
    this.prompt = detected.prompt.trim();
    this.mode = detected.mode;
    return true;
  }

  async initialize(enableSecret?: string) {
    const banner = await this.collectUntil((output) => this.hasPrompt(output), this.promptTimeoutMs, "prompt");
    if (!this.prompt) throw connectorError("CISCO_PROMPT_NOT_DETECTED", "prompt", "Cisco CLI prompt was not detected.", this.state, 502, true);
    if (this.mode === "user") await this.enterEnableMode(enableSecret);
    const paging = await this.runCommand("terminal length 0", false);
    const warnings = /%\s*(Invalid input|Unknown command|Authorization failed)/i.test(paging.stdout) ? ["Cisco paging-disable command was rejected; defensive paging handling remains active."] : [];
    return { banner: stripCiscoEchoAndPrompt(banner, ""), promptMode: this.mode as "user" | "privileged", warnings };
  }

  private async enterEnableMode(enableSecret?: string) {
    if (!enableSecret) throw connectorError("CISCO_ENABLE_SECRET_REQUIRED", "privilege", "The Cisco account reached user EXEC mode and requires a separately stored enable secret.", this.state, 401, false);
    this.stream.write("enable\n");
    const first = await this.collectUntil((output) => /password:\s*$/im.test(normalizeCiscoTerminalOutput(output)) || this.hasPrompt(output), this.promptTimeoutMs, "privilege");
    if (/password:\s*$/im.test(normalizeCiscoTerminalOutput(first))) {
      this.stream.write(`${enableSecret}\n`);
      await this.collectUntil((output) => this.hasPrompt(output), this.promptTimeoutMs, "privilege");
    }
    if (this.mode !== "privileged") throw connectorError("CISCO_ENABLE_FAILED", "privilege", "Cisco enable authentication failed.", this.state, 401, false);
  }

  async runCommand(command: string, rejectCliErrors = true) {
    const started = Date.now();
    this.stream.write(`${command}\n`);
    const output = await this.collectUntil((value) => this.hasPrompt(value), this.commandTimeoutMs, "command");
    const stdout = stripCiscoEchoAndPrompt(output, command);
    if (rejectCliErrors && /%\s*(Invalid input|Incomplete command|Ambiguous command|Authorization failed)/i.test(stdout)) {
      throw connectorError("CISCO_COMMAND_REJECTED", "command", "The Cisco device rejected a registered read-only command.", this.state, 502, false);
    }
    return { stdout, stderr: "", exitCode: 0, durationMs: Date.now() - started };
  }

  close() { try { this.stream.end(); } catch { try { this.stream.close(); } catch { /* already closed */ } } }
}

type CredentialResolver = (device: Pick<Device, "credentialId" | "credentialRef" | "capabilities">, profile: CiscoSshCompatibilityProfile) => Promise<ResolvedDeviceCredential>;

type ConnectorDependencies = {
  clientFactory?: () => Client;
  tcpConnect?: (host: string, port: number, timeoutMs: number) => Promise<Socket>;
  credentialResolver?: CredentialResolver;
};

export class CiscoIosXeSshConnector {
  readonly connectorType = "cisco-iosxe-ssh";
  readonly outputLimitBytes = 512_000;
  readonly tcpTimeoutMs = 5_000;
  readonly promptTimeoutMs = 10_000;
  readonly commandTimeoutMs = 20_000;

  private readonly dependencies: Required<ConnectorDependencies>;

  constructor(dependencies: ConnectorDependencies = {}) {
    this.dependencies = {
      clientFactory: () => new Client(),
      tcpConnect: openTcpSocket,
      credentialResolver: resolveDeviceCredential,
      ...dependencies
    };
  }

  async runReadOnlyCommands(device: Device, commandIds: CiscoReadCommandId[]): Promise<{ connectorInvoked: boolean; results: CiscoIosXeCommandResult[]; warnings: string[]; connection: CiscoConnectionEvidence }> {
    const compatibilityProfile = ciscoCompatibilityProfile(device);
    let state: DiagnosticState = initialDiagnosticState(compatibilityProfile);
    if (!isCiscoIosXeSshCandidate(device)) throw connectorError("CISCO_DEVICE_UNSUPPORTED", "input", "The selected device is not a Cisco SSH candidate.", state, 400, false);
    const credential = await this.dependencies.credentialResolver(device, compatibilityProfile);
    state = { ...state, connectorInvoked: true, connectionPhase: "tcp" };
    let socket: Socket;
    try {
      socket = await this.dependencies.tcpConnect(device.host, device.managementPort, this.tcpTimeoutMs);
      state = { ...state, transportConnected: true, connectionPhase: "ssh_negotiation" };
    } catch (error) { throw mapSshError(error, state); }

    const client = this.dependencies.clientFactory();
    try {
      const stream = await new Promise<ClientChannel>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => { if (settled) return; settled = true; callback(); };
        client.once("ready", () => {
          state = { ...state, authenticated: true, connectionPhase: "authentication" };
          client.shell({ term: "vt100", cols: 160, rows: 48 }, (error, channel) => {
            if (error) return finish(() => reject(connectorError("CISCO_SHELL_OPEN_FAILED", "shell", "Cisco SSH authenticated but an interactive CLI shell could not be opened.", state, 502, true, error)));
            state = { ...state, shellOpened: true, connectionPhase: "shell" };
            finish(() => resolve(channel));
          });
        });
        client.on("keyboard-interactive", (_name, _instructions, _language, prompts, finishPrompts) => finishPrompts(prompts.map(() => credential.password ?? "")));
        client.once("error", (error) => finish(() => reject(mapSshError(error, state))));
        client.once("close", () => finish(() => reject(connectorError("CISCO_SSH_CLOSED", state.authenticated ? "shell" : "ssh_negotiation", "The Cisco SSH connection closed before the interactive session was ready.", state, 502, true))));
        const connectConfig = ciscoConnectConfig(device, credential, compatibilityProfile, socket);
        state = { ...state, legacyCompatibilityApplied: Boolean(connectConfig.algorithms), connectionPhase: "ssh_negotiation" };
        client.connect(connectConfig);
      });
      state = { ...state, connectionPhase: "prompt" };
      const session = new CiscoInteractiveSession(stream, state, this.outputLimitBytes, this.promptTimeoutMs, this.commandTimeoutMs);
      try {
        const initialized = await session.initialize("enableSecret" in credential && typeof credential.enableSecret === "string" ? credential.enableSecret : undefined);
        const results: CiscoIosXeCommandResult[] = [];
        for (const commandId of commandIds) {
          const command = ciscoReadCommand(commandId);
          const strict = commandId === "platform";
          results.push({ commandId, command, ...(await session.runCommand(command, strict)) });
        }
        const platformOutput = results.find((item) => item.commandId === "platform")?.stdout;
        const platform = platformOutput ? detectCiscoPlatform(platformOutput) : null;
        const semantic = platformOutput ? ciscoConnectionSemantic(platformOutput) : "connected_supported";
        const diagnostic: CiscoConnectorDiagnostic = {
          code: semantic === "connected_supported" ? "CISCO_CONNECTED_SUPPORTED" : "CISCO_CONNECTED_UNSUPPORTED",
          stage: platform && !isSupportedCiscoAutomationPlatform(platform.platform) ? "platform_detection" : "command", retryable: false,
          userMessage: platform && !isSupportedCiscoAutomationPlatform(platform.platform) ? `Cisco SSH succeeded, but platform ${platform.platform} is not supported by the current Cisco automation path.` : "Cisco interactive SSH and read-only command execution succeeded.",
          remediation: platform && !isSupportedCiscoAutomationPlatform(platform.platform) ? REMEDIATION.platform_detection : [], ...state,
          connectionPhase: platform && !isSupportedCiscoAutomationPlatform(platform.platform) ? "platform_detection" : "command"
        };
        return { connectorInvoked: true, results, warnings: initialized.warnings, connection: { semantic, diagnostic, promptMode: initialized.promptMode, compatibilityProfile, legacyCompatibilityRequested: diagnostic.legacyCompatibilityRequested, legacyCompatibilityApplied: diagnostic.legacyCompatibilityApplied, connectionPhase: diagnostic.connectionPhase } };
      } finally { session.close(); }
    } catch (error) { throw mapSshError(error, state); }
    finally { try { client.end(); } finally { if (!socket.destroyed) socket.destroy(); } }
  }
  async runCliCommands(device: Device, specs: CiscoCliCommandSpec[]): Promise<{ connectorInvoked: boolean; results: CiscoIosXeCommandResult[]; warnings: string[]; connection: CiscoConnectionEvidence }> {
    if (!isCiscoIosXeSshCandidate(device)) throw connectorError("CISCO_DEVICE_UNSUPPORTED", "input", "Device is not a Cisco SSH target.", initialDiagnosticState(ciscoCompatibilityProfile(device)), 400, false);
    if (specs.length === 0) throw connectorError("CISCO_COMMAND_MISSING", "input", "At least one Cisco command spec is required.", initialDiagnosticState(ciscoCompatibilityProfile(device)), 400, false);
    const compatibilityProfile = ciscoCompatibilityProfile(device);
    const credential = await resolveDeviceCredential(device, compatibilityProfile);
    let state: DiagnosticState = initialDiagnosticState(compatibilityProfile);
    state = { ...state, connectorInvoked: true, connectionPhase: "tcp" };
    let socket: Socket;
    try {
      socket = await this.dependencies.tcpConnect(device.host, device.managementPort, this.tcpTimeoutMs);
      state = { ...state, transportConnected: true, connectionPhase: "ssh_negotiation" };
    } catch (error) { throw mapSshError(error, state); }

    const client = this.dependencies.clientFactory();
    try {
      const stream = await new Promise<ClientChannel>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => { if (settled) return; settled = true; callback(); };
        client.once("ready", () => {
          state = { ...state, authenticated: true, connectionPhase: "authentication" };
          client.shell({ term: "vt100", cols: 160, rows: 48 }, (error, channel) => {
            if (error) return finish(() => reject(connectorError("CISCO_SHELL_OPEN_FAILED", "shell", "Cisco SSH authenticated but an interactive CLI shell could not be opened.", state, 502, true, error)));
            state = { ...state, shellOpened: true, connectionPhase: "shell" };
            finish(() => resolve(channel));
          });
        });
        client.on("keyboard-interactive", (_name, _instructions, _language, prompts, finishPrompts) => finishPrompts(prompts.map(() => credential.password ?? "")));
        client.once("error", (error) => finish(() => reject(mapSshError(error, state))));
        client.once("close", () => finish(() => reject(connectorError("CISCO_SSH_CLOSED", state.authenticated ? "shell" : "ssh_negotiation", "The Cisco SSH connection closed before the interactive session was ready.", state, 502, true))));
        const connectConfig = ciscoConnectConfig(device, credential, compatibilityProfile, socket);
        state = { ...state, legacyCompatibilityApplied: Boolean(connectConfig.algorithms), connectionPhase: "ssh_negotiation" };
        client.connect(connectConfig);
      });
      state = { ...state, connectionPhase: "prompt" };
      const session = new CiscoInteractiveSession(stream, state, this.outputLimitBytes, this.promptTimeoutMs, this.commandTimeoutMs);
      try {
        const initialized = await session.initialize("enableSecret" in credential && typeof credential.enableSecret === "string" ? credential.enableSecret : undefined);
        const results: CiscoIosXeCommandResult[] = [];
        for (const spec of specs) {
          const commandResult = await session.runCommand(spec.command, spec.strict === true);
          results.push({ commandId: spec.commandId, command: spec.command, ...commandResult, stdout: spec.redactOutput ? redactCiscoCliOutput(commandResult.stdout) : commandResult.stdout, stderr: spec.redactOutput ? redactCiscoCliOutput(commandResult.stderr) : commandResult.stderr });
        }
        const platformOutput = results.find((item) => item.commandId === "platform")?.stdout;
        const platform = platformOutput ? detectCiscoPlatform(platformOutput) : null;
        const semantic = platformOutput ? ciscoConnectionSemantic(platformOutput) : "connected_supported";
        const diagnostic: CiscoConnectorDiagnostic = {
          code: semantic === "connected_supported" ? "CISCO_CONNECTED_SUPPORTED" : "CISCO_CONNECTED_UNSUPPORTED",
          stage: platform && !isSupportedCiscoAutomationPlatform(platform.platform) ? "platform_detection" : "command", retryable: false,
          userMessage: platform && !isSupportedCiscoAutomationPlatform(platform.platform) ? `Cisco SSH succeeded, but platform ${platform.platform} is not supported by the current Cisco automation path.` : "Cisco interactive SSH and controlled CLI execution succeeded.",
          remediation: platform && !isSupportedCiscoAutomationPlatform(platform.platform) ? REMEDIATION.platform_detection : [], ...state,
          connectionPhase: platform && !isSupportedCiscoAutomationPlatform(platform.platform) ? "platform_detection" : "command"
        };
        return { connectorInvoked: true, results, warnings: initialized.warnings, connection: { semantic, diagnostic, promptMode: initialized.promptMode, compatibilityProfile, legacyCompatibilityRequested: diagnostic.legacyCompatibilityRequested, legacyCompatibilityApplied: diagnostic.legacyCompatibilityApplied, connectionPhase: diagnostic.connectionPhase } };
      } finally { session.close(); }
    } catch (error) { throw mapSshError(error, state); }
    finally { try { client.end(); } finally { if (!socket.destroyed) socket.destroy(); } }
  }
}

export const ciscoIosXeSshConnector = new CiscoIosXeSshConnector();
