# Phase S M10 Mobile Release Candidate

## Android Outputs

- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- CI workflow: `.github/workflows/android-debug-apk.yml`

Release signing is optional and secret-driven. Unsigned/debug builds require no secrets. Signed release AAB builds require all of:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_STORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

No keystore, password, private key, APK, AAB, database, log, cache, or build output is committed.

## M10 Acceptance Gates

- Root build passes: `npm run build`
- Stability passes: `npm run test:v2-stability`
- Backend isolated suite passes: `npm exec -- tsx src/scripts/prepare-isolated-test-database.ts test`
- Android unit tests pass: `./gradlew --no-daemon testDebugUnitTest`
- Debug APK builds: `./gradlew --no-daemon assembleDebug`
- Release AAB builds with signing secrets: `./gradlew --no-daemon bundleRelease`
- Native SSH fixture tests cover success, authentication failure, host-key mismatch, timeout, cancellation, and recovery.
- Local Mode works with offline inventory, preview, approval binding, native SSH event persistence, audit, timeout, cancellation, and recovery.
- Server Mode remains API-backed and does not use mobile secure vault or native SSH directly.
- Plaintext credentials are absent from SQLite, ActionPlan parameters, audit payloads, logs, APK/AAB paths, and CI artifacts.

## Internal Alpha Gate

- Install debug APK on lab Android device only.
- Use mock or lab SSH devices only.
- Verify host-key probe and explicit trust before any SSH execution.
- Verify wrong host-key fingerprint blocks execution before commands run.
- Verify failed authentication returns a terminal failure without exposing the secret.
- Verify app background/foreground recovery shows final or observable execution state.
- Verify cancellation creates a terminal cancelled state and audit event.

## Closed Beta Gate

- Use signed AAB from CI with signing secrets enabled.
- Confirm Play Console internal test upload accepts package id `com.firewallsoar.app`, `versionCode`, and `versionName`.
- Repeat alpha SSH, vault, lifecycle, offline, and server-mode checks on every supported Android OS level in the test matrix.
- Confirm no CI artifact contains `.env`, keystore, credentials, logs, database files, APK-internal plaintext secrets, or generated caches.

## Remaining iOS Work

This work requires macOS and Xcode:

- Run `pnpm exec cap sync ios` on macOS.
- Open `ios/App/App.xcworkspace` in Xcode.
- Wire the Citadel-based `LocalSshPlugin` implementation for host-key probe, test connection, execute, timeout, cancellation, and event emission.
- Validate Keychain-backed secure credential retrieval by reference.
- Validate iOS foreground-only long-running SSH behavior and recovery UX.
- Configure Apple signing, bundle id, provisioning profiles, archive, and TestFlight upload.
- Run iOS simulator and physical-device tests for Local Mode, Server Mode, offline behavior, lifecycle, and cancellation.

## Rollback

Revert Phase S commits in reverse order:

```bash
git revert <batch-3-commit>
git revert <batch-2-commit>
git revert <batch-1-commit>
```

If release signing fails independently, revert only the Batch 3 commit. If native SSH fails independently, revert Batch 2 then Batch 1.
