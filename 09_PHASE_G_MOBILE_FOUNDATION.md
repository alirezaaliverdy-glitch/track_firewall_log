# Phase G — Mobile and PWA Foundation

## Objective
Prepare the existing React/Vite frontend for installation and later Capacitor packaging without moving connector or execution logic to the device.

## Architecture invariant

Mobile app -> HTTPS Backend API -> ActionPlan/PolicyGuard -> server-side connectors -> managed devices

Never store device passwords, SSH keys, API secrets or raw connector credentials on mobile.

## PWA foundation

Add a maintained Vite PWA integration, for example `vite-plugin-pwa`.

Requirements:

- manifest with Persian/English app name, icons and theme metadata
- installable shell
- service worker update notification
- offline route shell
- read-only cache for recent devices, actions and results where safe
- never queue or auto-replay mutable requests offline
- clear offline banner: read-only; execution unavailable
- no caching of credentials, auth responses, commands containing secrets or sensitive raw outputs

## Mobile UI readiness

- safe-area CSS for iOS
- bottom navigation for primary routes
- sidebar becomes drawer on narrow screens
- Action Center review uses bottom sheet
- tables have card/list fallback
- no horizontal page overflow at 390px
- command blocks may scroll internally
- network reconnect state for polling/SSE/WebSocket

## API/auth preparation

- centralize API base URL and transport in one client
- remove hardcoded localhost assumptions
- create an auth transport abstraction so future Capacitor can use secure native token storage without rewriting business UI
- keep current secure cookie flow for web in this phase
- document the future mobile token/refresh design; do not expose session tokens to JavaScript merely for convenience

## Capacitor readiness

Add configuration and scripts only after PWA tests pass:

- `capacitor.config.ts`
- package scripts for sync/open/build
- do not commit generated Android/iOS projects unless the environment can build and the user explicitly requests them
- document future Secure Storage, biometric unlock, push notifications and deep links

## Required tests

- installability/manifest test
- service worker update test
- offline shell loads
- offline mutation is blocked
- 390px Playwright checks for dashboard, assistant, devices and actions
- Persian RTL and English LTR
- no console errors
- desktop behavior unchanged

## Commit

`feat(mobile): add secure PWA and Capacitor-ready foundation`
