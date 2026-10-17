# Community and support workspace

Implemented locally on 2026-10-17 at `/community` (under `/firewall` on the local gateway). Available to every authenticated role; it does not grant device or action permissions.

## Design decisions and research

- Keep each subject and its replies together, rather than one noisy global stream. Slack's [thread guidance](https://slack.com/help/articles/115000769927-Use-threads-to-organize-discussions--) describes topic-based discussion organization.
- Put the list and conversation beside each other on desktop, and use list → conversation → back on mobile. Intercom's [Inbox guidance](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained) describes dedicated chat layouts; its [ticket guidance](https://www.intercom.com/help/en/articles/6436600-tickets-explained) distinguishes follow-up work from ordinary conversation.
- This implementation uses those interaction patterns, not their branding/assets: mint message bubbles, lavender selection, pearl canvas, restrained outlines, a single composer, and short Persian-first copy. Dark mode uses the same hierarchy. No fabricated presence, delivery/read receipts, SLA or agent activity.
- Ticket status and priority are visible without opening a technical panel. The small check icon means saved on the server, not read by a recipient.
- Native dialog, keyboard focus and Escape; retry retains the draft and request ID. Desktop Enter sends, Shift+Enter inserts a line; touch keyboards keep Enter as a line break. Reduced-motion preference is respected.

## Privacy and capability boundaries

- Discussions are visible to authenticated users of **the same workspace**, not every customer on the deployment. A ticket is visible only to its creator and its workspace administrator, including search, messages and read-state requests.
- Every route derives workspace and author from the session. Other-workspace administrator requests receive 404. Author responses contain only ID and display name. Message text is rendered as plain text, never HTML.
- Every role gets the narrow `community.participate` permission. Only admins get `community.moderate` for status changes; existing viewer device/action restrictions remain unchanged. Cookie CSRF, native bearer authentication, same-origin checks and bounded read/write rate limits still apply.
- Open / in progress / closed status; admin closes/reopens topics and tickets. Closed conversations reject new replies atomically with a thread lock. Audit records creation and status changes without copying message text.
- Text only, 120-character subject, 4,000-character message; normal/urgent tickets. Attachments, private direct messages, cross-customer public community, outbound email, typing/presence and AI answers are **not** part of this release.

## Data and delivery

`CommunityThread`, `CommunityMessage`, `CommunityRead` are additive PostgreSQL tables. Composite unique client keys make create/reply retry-safe. A sequence cursor supports bounded history and incremental refresh; read cursors only advance to an existing message in an authorized thread. Lists fetch 30 entries per page; messages fetch 60 per page. The UI uses visible-page polling (messages 5 seconds, inbox 10 seconds), not WebSockets. Drafts are held in memory only and are not promised across full reloads.

Migration `20261017120000_community` needs schema CREATE and `AppUser(id)` REFERENCES, not AppUser ownership. The production release preflight checks this before replacing services; the release verifier checks the migration. The migration was also tested under a non-superuser, non-AppUser-owner role in a disposable database. No production deployment is implied by local validation.

## Verification entry points

- Backend: build API, migrate an isolated database, then run `node --test backend/test/community-api.integration.test.mjs` with the compiled backend `dist` and dependencies available. Set `TEST_DATABASE_URL` to the isolated database and `DATABASE_URL` to a different application identity; existing test-database guards reject unsafe targets.
- `scripts/qa/capture-community.mjs`: intercepted synthetic APIs only; browser desktop/mobile/dark/light, request retry, private ticket status, drafts, viewer participation and keyboard dialog tests.
- `scripts/qa/capture-appearance.mjs`: actual conic-gradient gauge and center assertions in light mode plus existing theme/contrast/persistence regressions. No fixture proves private device connectivity or physical-phone behavior.

## Dashboard regression

The original light-only overrides explicitly removed the health dial's background and center, flattening the chart into text. Removed those overrides; restored a visible neutral track, a readable center and semantic score colors. Missing/offline sensors remain unknown; no historical metrics or traffic volumes are invented. Softer tinted page/sidebar surfaces and card gradients reduce the flat white appearance.
