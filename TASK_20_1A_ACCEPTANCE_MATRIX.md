# TASK 20.1A ACCEPTANCE MATRIX

## Database and readiness

- [ ] PostgreSQL reachable
- [ ] One shared pg Pool
- [ ] One shared Prisma client
- [ ] Shutdown idempotent
- [ ] No premature pool close
- [ ] Bounded retry
- [ ] No infinite retry
- [ ] No P1017 loop
- [ ] No ConnectionClosed loop
- [ ] `/api/health/live` 200
- [ ] `/api/health/ready` repeatedly 200
- [ ] Backend stable for at least 3 minutes

## Authentication

- [ ] bootstrapAdmin waits for readiness
- [ ] bootstrapAdmin idempotent
- [ ] Login API succeeds
- [ ] Dashboard opens
- [ ] Refresh preserves session
- [ ] No auth 5xx
- [ ] No unexpected console error

## Cisco onboarding

- [ ] Existing Credential Reference selected
- [ ] Secret never exposed
- [ ] Answers saved
- [ ] Session leaves draft
- [ ] Test connection invoked
- [ ] connectorInvoked=true
- [ ] Platform detection invoked
- [ ] Real platform evidence
- [ ] Discovery invoked
- [ ] Discovery persisted
- [ ] Preview built
- [ ] Commit invoked
- [ ] Device persisted
- [ ] Duplicate commit idempotent
- [ ] Workspace opens

## Success UX

- [ ] Animated success
- [ ] Persian/English
- [ ] RTL/LTR
- [ ] Reduced motion
- [ ] Manual close
- [ ] Auto dismiss
- [ ] Auto redirect
- [ ] Success preserved after redirect
- [ ] Back does not resubmit

## Workspace and Dashboard

- [ ] Real Device details
- [ ] Cisco-specific data
- [ ] Unsupported values not shown as zero
- [ ] Real persisted charts
- [ ] No random/mock chart values
- [ ] Correct freshness labels

## MCP

- [ ] 1440×900 FA
- [ ] 1440×900 EN
- [ ] 1280×800 FA
- [ ] 390×844 FA
- [ ] 390×844 EN
- [ ] No overflow
- [ ] No dead controls
- [ ] No unexpected 4xx/5xx
- [ ] No current-flow console errors
- [ ] Screenshots/snapshots saved
