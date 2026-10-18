# Community and support workspace

Implemented at `/community` (under `/firewall` on the local gateway). The 2026-10-18 collaboration extension is local-only until explicitly published. Available to every authenticated role; it does not grant device or action permissions.

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
- 120-character subject and 4,000-character message; normal/urgent tickets. Private direct messages, cross-customer public community, outbound email, typing/presence and AI answers are **not** part of this release.

## Collaboration extension

- Authors can edit or delete their own messages; no administrator impersonation of authors. Edits carry an optimistic revision. Delete removes body and attachment records, leaves a tombstone, redacts visible reply quotes and writes a metadata-only audit. Deletion cannot be undone. Retained backups can still contain old data until their normal retention expires.
- Replies reference an accessible, non-deleted message in the same conversation. The monotonic change feed synchronizes edits/deletions as well as new messages; clients ignore older revisions. Request hashes keep file/reply retries idempotent without resurrecting deleted messages.
- Message tools close outside/Escape, select an opening direction within the scroll area, and have touch controls. Composer exposes reply/edit context and pending files, keeps draft/file choices after failures, and restores the previous draft after editing. Mobile layout reserves bottom navigation.
- Three files per message, **5 MiB each**: PNG/JPEG/WebP, PDF, UTF-8 TXT/LOG/CSV. Executables, archives, HTML/SVG and macro documents are rejected. Name, bytes and extension are validated, not client MIME alone. File validation is **not antivirus scanning**; PDF/text files may still contain harmful material when opened externally. No automatic execution, extraction, inline media/PDF rendering or external file submission.
- Files are private PostgreSQL bytea records, never public/static paths. Every download repeats conversation/workspace/ticket authorization and uses attachment disposition, octet-stream, nosniff, sandbox and private/no-store. Cookie CSRF and native bearer transport remain supported. File controls follow the [OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
- Stored attachment payload caps: 100 MiB/workspace, 512 MiB/application; 50 MiB accepted/user per rolling day, counted from metadata-only upload audit even after deletion. A database advisory lock serializes budget checks across workers. These are logical payload quotas, **not a cap on all database/WAL/backups or other application data**; continue capacity monitoring. Uploads: 6/min/user, one concurrent/user, four/process, 30-second deadline. Downloads: 30/min/user, two concurrent/user, eight/process, 30-second deadline. Process-local concurrency/rate controls need a shared limiter if horizontally scaled.
- Shared **Tasks** tab: title, description, active same-workspace assignee, priority, due date, three statuses, search, assigned-to-me filter and bounded pages. Creator/workspace admin controls metadata and assignment; assignee can change status only. All roles can create/participate. Independent administrators are not silently merged into another workspace. A public discussion message can seed a task; a private ticket cannot become a shared source link. Task assignment executes no connector/device command.

## Data and delivery

`CommunityThread`, `CommunityMessage`, `CommunityRead` are additive PostgreSQL tables. Composite unique client keys make create/reply retry-safe. A sequence cursor supports bounded history and incremental refresh; read cursors only advance to an existing message in an authorized thread. Lists fetch 30 entries per page; messages fetch 60 per page. The UI uses visible-page polling (messages 5 seconds, inbox 10 seconds), not WebSockets. Drafts are held in memory only and are not promised across full reloads.

Migration `20261017120000_community` needs schema CREATE and `AppUser(id)` REFERENCES, not AppUser ownership. The production release preflight checks this before replacing services; the release verifier checks the migration. The migration was also tested under a non-superuser, non-AppUser-owner role in a disposable database. No production deployment is implied by local validation.

Additive migration `20261018120000_community_collaboration` requires ownership of the existing CommunityMessage table, schema CREATE and referenced-table access, but not AppUser ownership or superuser. Production preflight and exact migration acceptance were extended. No new upload volume is required. The backend CI job now migrates an isolated PostgreSQL service and runs the collaboration unit/API/role regressions before production can deploy.

## Verification entry points

- Backend: build API, migrate an isolated database, then run `node --test backend/test/community-api.integration.test.mjs` with the compiled backend `dist` and dependencies available. Set `TEST_DATABASE_URL` to the isolated database and `DATABASE_URL` to a different application identity; existing test-database guards reject unsafe targets.
- `scripts/qa/capture-community.mjs`: intercepted synthetic APIs only; browser desktop/mobile/dark/light, request retry, private ticket status, drafts, viewer participation and keyboard dialog tests.
- `backend/test/community-collaboration.test.ts`: byte/type/name/size validation, request hashing and narrow viewer permissions.
- `backend/test/community-collaboration.integration.test.mjs`: actual isolated API persistence, revisions/change feed, privacy/download headers, quotas/retries/rate limits, native viewers, task authorship/assignment, deletion and CSRF.
- `backend/test/community-migration-role.integration.test.mjs`: migration under a non-superuser that does not own AppUser.
- `scripts/qa/capture-collaboration.mjs`: intercepted edit/delete/reply, file/retry/download, source-to-task, assigned-viewer status, dark/light/mobile/320px and message-menu bounds.
- `scripts/qa/capture-appearance.mjs`: actual conic-gradient gauge and center assertions in light mode plus existing theme/contrast/persistence regressions. No fixture proves private device connectivity or physical-phone behavior.

## Dashboard regression

The original light-only overrides explicitly removed the health dial's background and center, flattening the chart into text. Removed those overrides; restored a visible neutral track, a readable center and semantic score colors. Missing/offline sensors remain unknown; no historical metrics or traffic volumes are invented. Softer tinted page/sidebar surfaces and card gradients reduce the flat white appearance.
