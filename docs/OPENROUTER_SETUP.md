# OpenRouter assistant setup

An administrator can open Settings > OpenRouter (`/settings?tab=ai`). Revoke any key pasted into a chat or screenshot, create a replacement in OpenRouter, and enter it only into the password field in this authenticated page. Never commit or send a key in chat.

Choose a model supported by the account, enable OpenRouter, explicitly approve sending assistant messages and evidence context to the selected external provider/model, then save. The key is encrypted with the server's existing credential-encryption key and never returned to the browser. An empty key field preserves the current key; disable the provider to return to the catalog/mock setting. Saving does not prove connectivity.

Use Test live response. It sends only a synthetic connectivity message and empty evidence, not stored device logs. Success requires a real nonempty provider response; a deterministic fallback is not accepted. An HTTP 403 is an upstream refusal, not proof of a bad key alone: check the provider account and authorized server network access. Do not disable TLS verification or reroute all application traffic through a VPN to conceal the failure.

Encrypted configuration lives at `/app/storage/settings/openrouter.json` in the dedicated settings volume. It is not under the uploads/public-web directory. Keep this volume and the existing credential-encryption key together in a protected encrypted backup; losing the encryption key makes stored credentials unreadable. Runtime overrides via `AI_SETTINGS_FILE` are for operator-managed/test environments, not a user-supplied path. New images initialize the directory for the non-root API user.

Model answers remain proposals. Catalog/ActionPlan/preview/confirmation/PolicyGuard/registered connector/audit controls are unchanged. The grouped finding page is a deterministic read model, not an external-AI verdict, and simultaneous IP activity does not prove a common attacker. Camera mobile polling uses the app's authenticated proxy, not a direct connection from the phone to a private camera IP.
