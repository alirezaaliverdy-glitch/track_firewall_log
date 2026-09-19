# Acceptance Matrix

## Repository Safety
- [ ] H8 confirmed green
- [ ] HEAD/branch/dirty state recorded
- [ ] unrelated files untouched
- [ ] fixtures only; no destructive production execution

## Architecture
- [ ] frontend and backend builds pass
- [ ] existing backend tests pass
- [ ] shared packages have no Node/native dependency
- [ ] server packages do not import mobile plugin
- [ ] mobile packages do not import Prisma/Fastify
- [ ] no circular dependency
- [ ] git diff --check passes

## Persistence/Vault
- [ ] SQLite migrations and recovery tested
- [ ] offline inventory works
- [ ] no secret in SQLite/localStorage/IndexedDB/logs/screenshots
- [ ] Android Keystore test
- [ ] iOS Keychain test where toolchain exists
- [ ] reset and encrypted export/import tested

## SSH Security
- [ ] first fingerprint prompt
- [ ] trusted fingerprint persisted
- [ ] mismatch hard-fails
- [ ] no accept-all code
- [ ] modern defaults
- [ ] legacy override per device and audited
- [ ] password/key fixtures
- [ ] timeout/cancel/output limit/sanitization
- [ ] sessions close on every error path

## Action Pipeline
- [ ] AI cannot invoke plugin
- [ ] UI cannot invoke plugin directly
- [ ] preview and approval required
- [ ] approval binds device/fingerprint/credential/parameters/commands/risk
- [ ] changes invalidate approval
- [ ] PolicyGuard blocks denied plan
- [ ] verification drives result
- [ ] duplicate execution prevented
- [ ] restart reconciles state
- [ ] audit chain verifies

## Product
- [ ] first-run Persian/English
- [ ] device save without connection
- [ ] host-key flow and connection test
- [ ] monitoring result
- [ ] single and multi-step fixture execution
- [ ] offline guided workflows
- [ ] BYOK optional and secure
- [ ] no VPS required

## Mobile UX
- [ ] 390px portrait/landscape/tablet
- [ ] RTL/LTR
- [ ] safe areas/touch/no overflow
- [ ] permission recovery
- [ ] lifecycle reconciliation
- [ ] no secret in notification

## Native Builds
Android:
- [ ] cap sync
- [ ] Gradle checks/plugin tests
- [ ] debug APK
- [ ] signing instructions; no key committed

iOS:
- [ ] source/project/plugin generated
- [ ] local-network privacy strings
- [ ] static consistency
- [ ] archive only on macOS/Xcode
- [ ] honest report if macOS unavailable

## Server Preservation
- [ ] backend/web start
- [ ] server device flow works
- [ ] Phase H tests pass
- [ ] server PolicyGuard/credentials not weakened
- [ ] deployment docs remain valid

## Evidence
- [ ] exact commands/exit codes
- [ ] M0-M10 commit IDs
- [ ] SSH library decision/license inventory
- [ ] threat model
- [ ] Android artifact path
- [ ] iOS status
- [ ] limitations and rollback
