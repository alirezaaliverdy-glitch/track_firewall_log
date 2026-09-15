# Platform Notes

The task was aligned with current official platform behavior:
- Capacitor provides a web-first native runtime and custom native plugin APIs.
- Android restricts background/foreground service starts and requires correct service declarations and permissions.
- iOS requires local-network privacy permission/description for local device access.
- iOS background execution is constrained and must use supported task APIs with honest state reconciliation.

Codex must inspect the repository's installed versions and native toolchains before selecting/upgrading dependencies.
