# SSH Library Decision

Recorded: 2026-07-23

## Selected Libraries

- Android: SSHJ `com.hierynomus:sshj`, Apache-2.0. It supports host-key verifier callbacks, password and public-key authentication, command sessions, timeouts, and explicit client close semantics. The local plugin uses a pinned SHA-256 host-key verifier and does not include any host-key bypass option.
- iOS: Citadel Swift SSH, selected for iOS source integration because it is a Swift SSH client package usable from a Capacitor plugin target. The committed iOS source enforces trusted-fingerprint input and currently reports pending Citadel host-key/vault handoff wiring rather than pretending archive-level SSH execution was validated on Windows.

## Rejected Options

- Any OpenSSH shell invocation from JavaScript or WebView: rejected because UI/AI must never invoke SSH directly.
- Any configuration equivalent to host-key accept-all or disabled strict checking: rejected because first trust must be explicit and mismatches must hard-fail.
- Server `ssh2` reuse inside WebView: rejected because Phase M forbids embedding the Fastify/Prisma/Node runtime inside the mobile app.

## License Inventory

- `@capacitor-community/sqlite` 8.1.0: MIT, repository `https://github.com/capacitor-community/sqlite`.
- `capacitor-secure-storage-plugin` 0.13.0: MIT, repository `https://github.com/martinkasa/capacitor-secure-storage-plugin`.
- SSHJ: Apache-2.0, repository `https://github.com/hierynomus/sshj`.
- Citadel: selected for iOS source wiring; iOS archive validation requires macOS/Xcode and is reported separately.

## Required Runtime Controls

- First use records algorithm and SHA-256 fingerprint before trust.
- Trust is scoped to device, host, and port.
- Fingerprint mismatch hard-fails.
- Legacy algorithms are per-device only and must increase risk and audit an override.
- Connection/auth/command/idle timeouts, cancellation, bounded UTF-8 streaming, terminal escape sanitization, stdout/stderr separation, output-size limits, and finally-path session close are required before a native execution result may be marked verified.
