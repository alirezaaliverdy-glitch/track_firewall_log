# Account visibility and incident-response reliability

## Scope (2026-10-17, local release)

- Managed admins retain their creator relation after creation/promotion. Admin asset/workspace scoping remains independent. Older orphaned admins are visible to their proven creator only when the existing creation audit supplies that evidence; unrelated administrators stay hidden. Accounts without that audit are not guessed or reassigned.
- Action Center exposes the backend's current approval requirements. Safe/high mode supplies its existing typed confirmation; protected quick-controlled mode still needs only one confirmation. The approver role is resolved from the active authenticated account ID, never an untrusted client role or ambiguous username lookup.
- A rejected request stays on the selected action with its actual error. Selected-action errors are outside the hidden composition form. Preview/pending results are not represented as executed or successful, and return to the same plan for review.
- Source restriction clearly names the selected source IP. A campaign is a read-only correlation view, not a bulk execution plan; this release does not claim to block every correlated IP with one action.

## MikroTik detection and containment

RouterOS login parsing separates the remote source/user from router/syslog-header addresses, handles supported success/failure message forms and validates addresses. Timestamp-distinct fast failures remain separate; duplicate transport copies do not inflate the count. Detection still depends on collection, required topics, timestamps and existing rule thresholds; no universal attack-coverage claim.

An Address List alone is not proof that traffic is blocked. Finding-derived/catalog source restrictions require a pre-existing first active `input` Drop rule that references the selected source list without additional matchers. The connector verifies this read-only before modifying the source list, then verifies the rule and enabled source entry after the write. Missing prerequisites/readback return an explicit failure rather than a success claim. Generic address-list maintenance remains distinct from incident containment.

No firewall rule is created, enabled, reordered or removed by this change. Automatic review rejected a proposed automatic first-position Drop rule because it could cut off router management; that expansion needs specific operator authorization. Current containment is IPv4 traffic directed at the router (`input`), not forwarded traffic or IPv6 blocking. Tested with an actual SSH transport and synthetic RouterOS responder, not a physical-router end-to-end test.

## Production diagnosis and rollout

Read-only sanitized server metadata reproduced a high-risk plan still in `dry_run_ready`, zero commands, no connector result, and `quick_execute_confirmation_required`. The prior frontend omitted the server-required confirmation, and the safe-mode service dropped the approver role. No device evidence, credentials or raw outputs were retrieved for this diagnosis. No schema migration is required for this release.

Local builds/deployments and isolated tests do not update eosnet.ir. Do not push without an explicit request. A production release must verify CI, exact server SHA/deploy marker, migrations/readiness, all service health and public UI before claiming availability.

## Product priorities (recommendations, not market-demand guarantees)

1. **Verified incident response:** show selected sources, affected assets, time-limited containment, exact per-source outcome and a tested undo path. Next add a registered scoped batch plan with partial-failure handling; never silently apply a single-IP plan to a whole campaign.
2. **Easy branch onboarding:** an outbound collector for small customers behind NAT, with a setup readiness check for logs, time sync, permissions and sensor freshness. Avoid requiring a managed router at every site.
3. **MSP/customer operations:** explicit customer workspaces, delegated administration, MFA and customer-ready periodic reports. Keep management relationships distinct from asset access grants.
4. **Service impact and support:** link incidents to existing tickets, owner/SLA, notification deduplication and the business service affected. Service impact is an established monitoring capability; differentiation should be simpler Persian workflows and verifiable remediation, not a claim competitors lack it.
5. **Camera health beyond viewing:** recording/retention gaps, storage health and offline-channel alerts, with explicit supported-vendor capability status.

Primary references: [RouterOS logs](https://manual.mikrotik.com/docs/diagnostics-monitoring-and-troubleshooting/log/), [RouterOS address lists](https://manual.mikrotik.com/docs/firewall-and-quality-of-service/firewall/address-lists/), [RouterOS filter](https://manual.mikrotik.com/docs/cli-reference/ip/firewall/filter/), [Zabbix service monitoring](https://www.zabbix.com/documentation/7.0/en/manual/it_services).

## Acceptance entry points

- `backend/test/admin-response-regression.test.ts`: creation/promotion, legacy recovery, independent admin privacy, safe-mode confirmation, forged-role/ID-vs-username rejection, real admin connector invocation and unchanged quick-mode requirements.
- `backend/test/mikrotik-detection-response.test.ts`: supported login/firewall formats, source identity, success/failure and six fast attempts/deduplication, registered read-only prerequisites.
- `backend/test/mikrotik-containment-ssh.test.ts`: actual SSH fixture, zero writes without a prepared rule, verified source-list update, failed readback and absence of automatic firewall mutations.
- `scripts/qa/capture-response-confirmation.mjs`: synthetic browser/mobile preview, existing safe-mode approval, visible rejection without navigation, retry with invocation proof, protected quick-mode single confirmation. Never invokes a real device.
- `scripts/deploy/diagnose-recent-responses.sh`: read-only sanitized production action/audit metadata; no raw commands, IPs, usernames, parameters or credentials.
