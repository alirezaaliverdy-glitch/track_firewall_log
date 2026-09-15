# Linux Telemetry

## Purpose

Linux telemetry provides vendor-aware, read-only security observability for registered Linux SSH devices. It collects a structured posture snapshot, analyzes initial security risks, and streams selected logs to the authenticated UI.

Telemetry uses the exact selected route `deviceId`. Linux SSH capability accepts the canonical Linux type as well as Linux vendor/type aliases and stored Linux/SSH capability metadata.

## Connection and Service Ports

The SSH connection endpoint and the remote service configuration are separate concepts:

- `connectionPort`: the port the application uses to reach SSH. The configured `Device.managementPort` is preferred, followed by compatible legacy connection fields, with 22 only as the final fallback.
- `detectedSshServicePort`: the port reported by `sshd -T` on the remote host.

For a NAT or port-forwarded endpoint, the application may connect to `185.89.22.116:22022` while sshd reports service port `22`. The telemetry UI shows both values.

## Snapshot Sections

- Host identity, operating system, kernel, uptime, timezone, architecture, and virtualization hints
- Interfaces, routes, listening services, and wildcard-bound exposed ports
- Effective SSH posture and recent authentication activity
- Interactive users, sudo/wheel membership, and recent login history
- UFW, iptables, nftables, and firewalld posture
- Fail2ban, auditd, unattended upgrades, and important service status
- Docker containers, published ports, and networks when accessible
- Web service status and enabled site names
- Recent journal and kernel warnings

Snapshot collection returns partial results when commands or privileges are unavailable. Command metadata records success, skipped sections, output line counts, and redacted warnings without storing command credentials.

## Live Log Sources

- SSH/authentication
- System journal or distro system log fallback
- Kernel journal
- Firewall/UFW log
- Nginx access and error logs
- Docker service journal

Only selected fixed sources can be started. Streams have one active session per device, a 500-event in-memory buffer, and a 30-minute maximum runtime. Missing files or unavailable sources produce warnings without stopping healthy sources.

## Live Monitoring Workflow

`Start Live Security Monitoring` selects essential sources, starts the stream, and collects a background baseline when the latest snapshot is missing or stale. Available presets are:

- Essential Security: authentication, system, firewall, and kernel signals
- Web Server: Nginx, authentication, and firewall signals
- Docker Host: Docker, system, kernel, and authentication signals
- Full Observation: every available source

The browser may reconnect its SSE viewer without stopping the server-side SSH stream. Heartbeats keep idle viewers open. Individual source failures are delivered as warnings and do not stop other sources.

Live events are aggregated into findings with severity, evidence, affected IP/user/port, first/last seen timestamps, count, recommendation, and status. A finding can be acknowledged or converted into a proposed ActionPlan. Creating a fix action never approves or executes it.

The AI shortcut sends a compact finding summary, suspicious IPs, exposed ports, counts, and short evidence summaries. Full raw live logs are not sent by default.

## Read-Only Safety Model

- Every snapshot and stream command is identified by a server-side allowlist entry.
- APIs never accept a shell command or command fragment.
- No configuration, service, user, firewall, package, or container changes are performed.
- Snapshot commands use timeouts and preserve partial results.
- Outputs are bounded and common password, token, API-key, authorization, and private-key patterns are redacted.
- Credentials are resolved through the existing `DeviceCredential` architecture and are never returned by telemetry APIs.
- Full raw streams are not sent to AI context by default.

## Linux Permissions

Root SSH accounts can run allowlisted reads directly. Non-root accounts are checked with `sudo -n true`:

- `root`: all allowlisted reads run directly.
- `sudo`: privileged reads use non-interactive `sudo -n`.
- `limited`: non-privileged sections continue and privileged sections are skipped or return source warnings.

Telemetry never prompts for a sudo password. A sudo-capable account must have an existing non-interactive policy for privileged sections.
When `sudo -n` is unavailable, telemetry reports: `Connected with limited privilege. Some telemetry requires sudo -n/NOPASSWD.` It does not classify the connected device as missing.

## Known Limitations

- Command output varies across distributions, init systems, firewall tools, and package versions.
- In-memory stream sessions do not survive backend restarts.
- Initial signal detection is intentionally lightweight and is not Detection Engine 2.0.
- Docker privileged-mode visibility depends on fields available in the local `docker ps` output.
- Nginx configuration contents are not dumped; only service state and enabled site names are collected.
- Public exposure is inferred from wildcard listeners and does not replace upstream firewall or routing analysis.

## Event Intelligence Direction

Suspicious live signals are stored in the existing `SecurityEvent` model with device, stream, source, timestamp, redacted message, severity, and tags. Future Event Intelligence work can correlate these signals across time, devices, incidents, and vendor telemetry without changing the read-only collector boundary.
