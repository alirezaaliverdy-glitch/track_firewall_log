# QUICK RUNBOOK — Task 20.1A

## Preconditions

Keep running:

```powershell
cd C:\Users\mr-alireza\Desktop\track_firewall_log
npx -y @playwright/mcp@latest --port 8931
```

Codex MCP URL:

```text
http://localhost:8931/mcp
```

The existing database/runtime configuration must be used without reading or printing `.env`.

## Approved real target

```text
Cisco IOS-XE
192.168.7.12
TCP 22
Credential Reference: cisco-f2 — admin
```

Read-only discovery only.

## Success indicators

```text
GET /api/health/ready → 200
login → authenticated dashboard
connectorInvoked=true
Device ID returned
/assets/devices/:deviceId opens
animated success visible
```

## Failure indicators

```text
P1017
ConnectionClosed
database connection timeout
session remains draft
only /answers called
connectorInvoked=false
Device ID missing
```
