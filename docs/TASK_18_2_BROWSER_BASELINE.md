# Task 18.2 Browser Baseline

Date: 2026-07-12
Tool: Playwright MCP `mcp__playwright`, authenticated browser session.

## Routes Inspected Before Editing

Desktop 1440x900 and mobile 390x844 were inspected for:

- `/dashboard`
- `/assets`
- `/assets/devices`
- `/monitoring`
- `/actions`
- `/assistant`
- `/integrations`

Screenshots are stored in `docs/evidence/task-18-2/baseline-*.png`.

## Findings

- Session was authenticated; no login gate blocked the baseline.
- RTL was active with `html lang=fa` and rendered direction `rtl`.
- No horizontal overflow was detected on desktop or mobile for the inspected routes.
- Console and request-failed listeners captured no route-local errors during the sweep.
- `/monitoring` already shows the Linux Server Overview with live SSH-derived host, CPU, memory, disk, network, services, listening ports and warning data.
- Vendor management visibility was limited to generic asset/vendor names; no Cisco capability matrix existed before 18.2A.
- Mobile shell hides the desktop sidebar and keeps the bottom navigation to Dashboard, Assets, Security and Actions.

## Baseline UX Gaps

- Cisco vendor capability status was not visible.
- Linux health metrics were visible as a server overview but not persisted as metric samples/health snapshots.
- Some terminal-captured labels appear mojibake, but the browser text rendered as Persian.
