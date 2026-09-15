# PHASE M — LOCAL-FIRST MOBILE RUNTIME

## 0. Goal

Build a standalone Android/iOS application that performs local inventory, planning, approval, SSH execution, verification and audit without a VPS, while preserving the completed Phase H server/web runtime.

This phase starts only after H8 is green.

## 1. Runtime Boundary

Create:

```ts
type RuntimeKind = "local-mobile" | "server";

interface ExecutionRuntime {
  readonly kind: RuntimeKind;
  getCapabilities(): Promise<RuntimeCapabilities>;
  listDevices(): Promise<DeviceSummary[]>;
  createDevice(input: CreateDeviceInput): Promise<DeviceDetails>;
  createPlan(input: CreatePlanInput): Promise<ActionPlan>;
  validatePlan(planId: string): Promise<PlanValidationResult>;
  approvePlan(input: ApprovalInput): Promise<ApprovalReceipt>;
  executePlan(input: ExecutePlanInput): Promise<ExecutionHandle>;
  cancelExecution(executionId: string): Promise<void>;
  observeExecution(executionId: string): AsyncIterable<ExecutionEvent>;
  getExecutionResult(executionId: string): Promise<ExecutionResult>;
  listAuditEvents(filter?: AuditFilter): Promise<AuditEvent[]>;
}
```

The UI must use RuntimeFacade. Existing backend API becomes ServerRuntimeClient. New LocalMobileRuntime operates inside the app. Do not open an internal HTTP listener and do not embed the existing Fastify/Prisma server in WebView.

## 2. Shared Core

Extract portable code into packages such as:

```text
packages/contracts
packages/action-core
packages/policy-core
packages/vendor-schemas
packages/verification-core
packages/runtime-contracts
```

Portable: types, schemas, ActionPlan, risk, approval hash, parameter schemas, verification definitions, result states, deterministic templates.

Server-only: Fastify, Prisma, Node filesystem/process, server auth, workers, server connectors.

Mobile-only: Capacitor plugins, SQLite, Keychain/Keystore, foreground/background lifecycle.

Add dependency-boundary tests and prohibit circular imports.

## 3. Local Persistence

Use maintained Capacitor-compatible SQLite after checking current repository versions and license.

Store devices, plans, drafts, approvals, execution state, verification evidence, audit, known-host fingerprints and settings.

Requirements:
- versioned deterministic migrations
- transactional writes
- crash-safe execution state
- database recovery UX
- local reset flow
- no plaintext secrets in SQLite, localStorage, IndexedDB, state persistence, service worker cache, logs or notifications

## 4. Native Credential Vault

Use Android Keystore-backed and iOS Keychain-backed secure storage.

SQLite stores only credential metadata and a vault reference. Support password and private-key authentication with optional passphrase.

Requirements:
- no hardcoded credential or AI key
- biometric/PIN may unlock vault locally
- secret-entry screens protected from screenshots where platform permits
- clipboard disabled by default for secrets
- deleting credential invalidates references safely
- no secret is returned to ordinary JS state when native handoff can avoid it

## 5. Native SSH Capacitor Plugin

Create a stable TypeScript contract and native Android/iOS implementations:

```ts
interface LocalSshPlugin {
  getHostKey(options: HostKeyProbeOptions): Promise<HostKeyResult>;
  testConnection(options: SshConnectionOptions): Promise<SshConnectionResult>;
  execute(options: SshExecuteOptions): Promise<SshExecutionStart>;
  cancel(options: { executionId: string }): Promise<void>;
  addListener(eventName: "sshExecutionEvent", listener: (e: SshExecutionEvent) => void): Promise<PluginListenerHandle>;
}
```

Codex must evaluate maintained native SSH libraries against current Android/iOS toolchains, license, host-key controls, algorithms, streaming, cancellation and authentication. Document selected and rejected libraries in `docs/mobile-local/SSH_LIBRARY_DECISION.md`. Do not invent undocumented library APIs.

### Host Key

- Never use `StrictHostKeyChecking=no`.
- Never silently accept all host keys.
- First use shows algorithm and SHA-256 fingerprint and requires explicit trust.
- Persist trusted fingerprint.
- Mismatch hard-fails.
- Replacement requires separate confirmation and audit.
- Host/IP change never inherits trust automatically.

### Algorithm Policy

Use modern defaults. Legacy algorithms require a per-device compatibility override, warning, risk increase and audit. Never lower global defaults.

### Execution Reliability

Implement connection/auth/command/idle timeout, cancellation, bounded UTF-8 streaming, stdout/stderr mapping when available, output-size limits, terminal control-sequence sanitization, ordered step execution, finally-path session close and lifecycle reconciliation.

Transport completion or exit code alone is not verified success.

## 6. Local Device Onboarding

Support:
1. Save inventory without connection or credential.
2. Select/create credential.
3. Probe and trust host key.
4. Test SSH.
5. Detect platform/capabilities when possible.
6. Save verified state.

Offline device registration must not be blocked. Show only SSH until a real native API connector exists.

## 7. Local Action Pipeline

```text
Intent/User Selection
→ ActionPlan
→ Parameter Validation
→ Risk
→ Preview
→ Explicit Approval
→ Approval Hash Check
→ Local PolicyGuard
→ Native SSH
→ Verification
→ Result
→ Local Audit
```

Only LocalMobileRuntime may call the native plugin. UI and raw AI output may not call it.

Approval binds to plan hash, device ID, credential reference, trusted host-key fingerprint, parameters hash, commands hash, risk version and expiration. Material changes invalidate approval.

## 8. Monitoring and Operations

Monitoring is read-only and vendor-aware. Mutation hidden in a monitoring batch must be rejected.

Support interfaces, CPU/memory/storage, routes, neighbors, VLANs, firewall sessions/config inspection, VPN state, Linux services/processes/ports/logs.

Mutations use the same Phase H single-step and multi-step plans, parameter workspace, preview, approval, verification, retry and result semantics.

## 9. Local AI

The app must remain useful with no AI or internet through deterministic catalog/workflows.

Optional modes:
- BYOK cloud provider, key in native vault
- user-configured OpenAI-compatible LAN endpoint
- future on-device model, not required

Redact secrets and sensitive output before any AI request. Show provider/destination. AI never executes. Network failure returns to deterministic workflow without corrupting drafts.

## 10. Local Audit and Backup

Audit vault events, credential metadata changes, host-key trust/mismatch/replacement, device changes, plans, approvals, execution, verification, overrides, export/import/reset.

Use append-oriented hash chaining:

```text
eventHash = SHA256(previousHash + canonicalEventPayload)
```

Provide authenticated encrypted export/import with versioned manifest, integrity validation, duplicate preview and optional credential inclusion only after explicit warning. No plaintext temp file.

## 11. Mobile UI

Required screens:
- first-run/language/local-mode explanation
- local network permission
- vault setup
- device list/register/detail
- credential vault
- host-key trust/mismatch
- assistant/catalog
- parameter workspace
- preview/approval
- progress/result/monitoring
- audit
- diagnostics
- encrypted backup/restore

Support Persian RTL and English LTR, 390px phone, landscape, tablet, safe areas, dark/light, accessible touch targets and no horizontal overflow. Never place large forms inside chat.

## 12. Lifecycle

Android: user-started long execution may use a correctly declared foreground service with ongoing notification, started from visible action and stopped immediately after completion/cancel.

iOS: use supported background task APIs only when applicable; otherwise persist and reconcile honestly. Warn before long operations. Never claim background continuation without native evidence.

General: prevent duplicate execution, persist state before suspension, reconcile native execution on resume and show keep-app-open guidance when needed.

## 13. Permissions and Network

- Android INTERNET permission
- iOS local-network usage description
- denied-permission recovery
- Wi-Fi/mobile transition handling
- private-IP reachability diagnostics
- explicit saved targets only
- no implicit network scanning
- IPv4 first; IPv6 only after complete validation

## 14. Threat Model

Create `docs/mobile-local/THREAT_MODEL.md` covering lost/rooted phone, malicious app, clipboard/screenshot, WebView injection, dependency compromise, MITM, rogue LAN, command injection, terminal escapes, oversized output, AI prompt injection, approval replay, duplicate execution, audit tampering, backup theft and debug leakage.

Minimum controls: strict CSP, no eval/remote code, navigation allowlist, output sanitization, secure vault, host-key pinning, approval binding, idempotency, release logging policy and secret redaction.

## 15. Preserve Server Runtime

- Server backend/web remain buildable and deployable.
- Native plugin is never imported by server packages.
- Mobile SQLite does not replace Prisma.
- Local vault does not replace server credential service.
- Local approval does not weaken server approval.
- No server routes are removed.
- Phase H tests remain green.

Run server regression after every runtime-boundary commit.

## 16. Capacitor Packaging

Use the repository-compatible current Capacitor major; do not upgrade blindly.

Generate/maintain `android/`, `ios/` and `capacitor.config.*` with stable app ID, no production localhost URL, privacy descriptions, controlled release logging, dependency/license inventory, Android debug APK and release-signing documentation without committing keys.

Generate iOS project and plugin source. Full iOS archive requires macOS/Xcode. On Windows, report source/static checks honestly and never claim a successful archive.

## 17. Tests

Unit:
- RuntimeFacade
- shared serialization
- policy parity
- approval hashes
- host-key state machine
- algorithm override scope
- secret references
- migrations
- audit chain
- execution state/cancel/timeouts
- output limits/sanitization
- AI redaction
- export integrity

Integration:
- inventory without credential
- vault reference
- first trust and mismatch failure
- password/key auth against fixture
- monitoring
- safe mutation against fixture
- multi-step failure
- verification success/failure
- app restart/resume
- duplicate prevention
- server regression

E2E:
- first-run
- RTL/LTR and 390px/tablet
- device/vault/host-key
- parameter/approval/progress/result
- permission denied
- offline deterministic mode
- lifecycle
- no secret rendered/logged

Never target production devices in automated tests.

## 18. Implementation Order and Commits

M0 Audit and characterization
`test(mobile-local): characterize runtime boundaries`

M1 Shared portable contracts
`refactor(core): extract portable execution contracts`

M2 RuntimeFacade plus server/local adapters
`refactor(runtime): add server and local execution adapters`

M3 SQLite and native vault
`feat(mobile-local): add local persistence and secure vault`

M4 Native verified SSH plugin
`feat(mobile-local): add native verified ssh connector`

M5 Local approval/policy/execution/verification/audit
`feat(mobile-local): execute approved plans locally`

M6 Monitoring and guided workflows
`feat(mobile-local): add monitoring and guided workflows`

M7 Optional secure AI providers and offline fallback
`feat(mobile-local): add optional secure ai providers`

M8 Mobile UX and lifecycle
`feat(mobile): complete local-first native experience`

M9 Native packaging
`build(mobile): add reproducible native packaging`

M10 Acceptance and stabilization
`test(mobile-local): complete local mobile acceptance`

## 19. Stop Conditions

Stop for incomplete H8, persistent real test failure, unacceptable dependency/license, unavailable required toolchain, or any need to hit a real production device destructively.

Do not stop for temporary internet/MCP disconnect, retryable sandbox error outside repo, unrelated dirty files, missing artwork or lack of macOS for Android work/iOS source generation.

## 20. Definition of Done

- Local Mode runs without VPS.
- Inventory can be saved offline.
- Credentials are in Keychain/Keystore.
- SSH fingerprint is explicitly trusted and pinned.
- Monitoring runs and displays live results.
- Mutation requires preview, approval, PolicyGuard and verification.
- Restart does not silently duplicate/lose state.
- Android debug APK builds.
- iOS source/plugin/project are generated; archive status is honest.
- Server backend/web and Phase H tests remain green.
- No raw secret exists in DB, browser stores, logs, UI artifacts or source control.
