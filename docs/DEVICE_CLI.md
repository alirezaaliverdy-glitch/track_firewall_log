# Device CLI

Entry: Assets > Devices > a device > **Open CLI** in the device header.
Route: `/assets/devices/:deviceId/terminal`.

This is an administrator-operated, dedicated SSH PTY, implemented separately
from automatic catalog/AI actions. It preserves the configured device account's
permissions and actual remote shell state. It supports keyboard input, Tab,
Ctrl+C, terminal resize and remote interactive prompts. Commands execute when
the administrator types them; there is no automatic command suggestion/replay,
privilege elevation or invented success/verification result.

The minimal terminal follows the supplied terminal screenshot: a continuous
canvas, compact session dock at the bottom, keyboard shortcuts behind a toggle,
and collapsible connection details. Light appearance uses grey-blue paper and
dark ink; dark appearance has a dark canvas. Both preserve the actual device's
ANSI output rather than generating a vendor banner or system-health values.
Fullscreen applies to the console itself.

## Connection admission and scope

- `devices.terminal` is admin-only. Viewers/operators cannot open, read or send
  input to a PTY, even if they know its identifier.
- Existing authentication, section access, CSRF/native bearer checks and rate
  controls apply. Every session belongs to one workspace, administrator and
  login-session hash. A second login cannot attach to it.
- Only the registered device's configured primary SSH or enabled secondary SSH
  channel is used. Browser-supplied hosts/ports/accounts are never accepted.
  Credentials remain encrypted in existing storage and are decrypted server-side.
  ONVIF, RTSP, SNMP and API-only devices do not imply SSH capability.
- Preview probes the SSH public host key without authentication, resolves and
  pins the network address, and creates a short-lived single-use server preview.
  The user confirms the target/account/fingerprint once. Admission requires
  `intent=execute`, confirmation, the implemented `interactive_ssh_session`
  template/planner/connector, PolicyGuard's human-session admission and a
  successful audit write before SSH login.
- Stored ESXi SSH identity wins when configured. Otherwise, first successful
  confirmed connection saves `terminalSshFingerprint` in existing capabilities.
  Later mismatches block login. Replacement keys require administrator review;
  mismatches are never automatically accepted or replaced.
- Device/credential/company/channel/VPN revisions are checked before admission,
  after authentication and before I/O. Login validity is checked again after
  the handshake. Reconfiguration closes the old session before further input.
  Registered split VPN routes are validated; default application routing stays
  unchanged. The terminal does not activate VPN or enable remote SSH services.

The existing ActionPlan/catalog/expert editor, execution PolicyGuard, audit,
`quick_controlled` and lab flags retain their current behavior. The human CLI
does not accept an AI-authored ActionPlan as terminal input.

## Session lifecycle and resource limits

Authenticated, no-store HTTP polling carries base64 SSH bytes; authenticated
CSRF-protected POSTs carry input and resize messages. No WebSocket route,
public port, extra daemon or Compose privilege is required. Production gateways
use the existing API path. A single API process owns live sessions; a restart
closes them. Multiple API replicas would need affinity/session ownership routing
before scaling this feature.

- Maximum 8 live sessions/process and 2/administrator, including connecting PTYs.
- Preview identity probes: at most 8 concurrently and one/login session;
  preview store at most64 entries, expiring after2 minutes.
- Backend output ring256 KiB; reads64 KiB; old output is explicitly marked as
  truncated. Browser scrollback2500 lines. Total32 MiB output/session closes a
  runaway stream. At most64 retained session records/process.
- Input32 KiB/request,512 KiB/minute/session, bounded channel backpressure;
  sequential acknowledgments reject replay. UI batches keystrokes, never retries
  uncertain command delivery, disables input during transport recovery and
  asks before a large clipboard paste.
- The page explicitly closes its PTY on leaving. A lost browser is reaped after
  a120-second lease; no input for10 minutes or a2-hour lifetime also closes it.
  It does not promise to undo executed commands or kill detached remote jobs.
- Session requested/connected/closed metadata is audited, including byte counts
  and duration. Input/output are memory-only, never stored as transcripts;
  terminal request payloads are redacted from application logs. Initial audit
  failure prevents login; close metadata retries three times on database errors.
  A database outage can still prevent a final close record.
- No device output can open URLs or modify the browser clipboard. Terminal
  output is parsed by xterm, never injected as application HTML.

## Relevant implementation

- `backend/src/terminal/terminal-runtime.ts`: bounded SSH PTY lifecycle and I/O.
- `backend/src/terminal/terminal.service.ts`: planner, credential/VPN/identity
  admission, ownership and metadata-only audit.
- `backend/src/routes/terminals.ts`: authenticated device/session endpoints.
- `src/features/terminal/`: route, device entry, terminal UI and client.
- `backend/test/terminal-runtime.test.ts`: real isolated SSH protocol/PTY fixture,
  state, control keys, resize, output bounds, lease and audit-failure behavior.
- `backend/test/terminal-api.integration.test.ts`: real isolated PostgreSQL and
  SSH fixture covering authentication/CSRF/roles/workspace/login isolation,
  single-use preview, host trust, revision revocation and secret-free audit.
- `scripts/qa/capture-terminal.mjs`: intercepted synthetic APIs only, desktop/
  mobile/320px, both appearances, preview versus connect, keyboard, disconnect,
  retained output, unsupported device and identity mismatch. Physical vendor
  compatibility depends on the configured SSH service and account.
