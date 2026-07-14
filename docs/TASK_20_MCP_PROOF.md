# Task 20 MCP Proof

Date: 2026-07-14

## Playwright MCP Session

Playwright MCP is available in this exact Codex session.

Invocation:

```text
mcp__playwright.browser_tabs(action=new, url=http://localhost:5173)
mcp__playwright.browser_snapshot(depth=4, boxes=true)
```

Observed browser state:

| Field | Value |
| --- | --- |
| URL | `http://localhost:5173/` |
| Page title | `log-app` |
| Snapshot file | `.playwright-mcp/page-2026-07-14T08-56-05-007Z.yml` |
| Console log file | `.playwright-mcp/console-2026-07-14T08-56-03-974Z.log` |

Visible authenticated text and controls included Persian primary navigation:

- `داشبورد`
- `دارایی‌ها`
- `امنیت`
- `پایش`
- `اقدامات`
- `دستیار هوشمند`
- `یکپارچه‌سازی‌ها`
- disabled global search with `جست‌وجوی سراسری هنوز در دسترس نیست.`

## Acceptance Boundary

This proof only verifies MCP availability, current URL/title, and visible authenticated shell rendering. It does not prove diagnostics, connector execution, worker execution, persistence, or provider success.

## Diagnostics UI Evidence

After implementing the diagnostics slice, MCP opened:

```text
http://localhost:5173/tools/history
```

Observed:

- Page title: `log-app`
- Snapshot file: `.playwright-mcp/page-2026-07-14T09-10-28-261Z.yml`
- visible `Target: example.com`
- visible provider request IDs `446466a3k175, 446466cfk36b, 446466e5k33e, 4464670ck87e`
- visible history table

This proves UI rendering of the persisted diagnostic result, while provider invocation and database persistence are proven separately by the backend route evidence in `docs/TASK_20_API_FAILURE_REGISTER.md`.

## Nmap Route Attempt

MCP opened:

```text
http://localhost:5173/tools/nmap
```

Observed page title: `log-app`.

The current MCP browser context displayed the unauthenticated login page, not the authenticated Tools UI. Therefore `/tools/nmap` browser acceptance is not claimed from this snapshot.
