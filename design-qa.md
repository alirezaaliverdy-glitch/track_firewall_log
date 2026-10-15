# Design QA — Compact evidence, mobile cameras and provider settings

- Public release acceptance: delivered main 934391d passes the same 16-capture suite at https://eosnet.ir. Repeated touch-frame requests (15) render the synthetic JPEG test pattern; first-view source table and collapsed technical detail match the local layout. Public mobile finding/video captures visually inspected. No real account credential, camera command or OpenRouter request is used by browser fixtures; physical Safari/device-network reachability is not inferred.
- Date: 2026-10-15. Finding review now has one concise summary, an IP/source table and one preview action; previous technical content is collapsed. Groups share target/rule-title/source/port and a 15-minute window; evidence limitations remain explicit.
- Updated finding/VPN runner passes seven captures including compact desktop/mobile first views and exact action handoff. Camera runner passes seven captures, with touch emulation, visible synthetic JPEG media and repeated authenticated frame polling. Provider-settings runner passes two captures, empty password field after save, explicit data-consent gating and a fixture live-test result.
- Sixteen captures total; no runtime errors or horizontal/dialog overflow. Finding desktop/mobile and provider mobile screenshots inspected. API fixtures are intercepted and production PWA worker bypassed only in the QA browser. No real login, API key, device write or actual OpenRouter response is used in browser tests.
- Separate backend tests cover real synthetic RTSP decoding, shared decoder capacity, encryption, workspace and action/session boundaries. Production/public acceptance follows rollout. Original chat-exposed key was not stored or activated.

---

# Design QA — Finding analysis and WireGuard import

- Date: 2026-10-15. Implemented an analysis-first finding detail using the existing product styles; replaced repeated summary/severity panels with compact status/context when structural analysis is available.
- Synthetic browser suite: `scripts/qa/capture-finding-analysis.mjs`; 1440px desktop and 390px mobile. Five captures cover interpreted sudo evidence, reanalysis, exact Action Center review, native WireGuard picker, paste fallback and private-route save. All API calls are intercepted with synthetic data and the production PWA worker is bypassed in the test browser.
- Verified actor differs from effective root account, corrected interpretation is visible, source action opens its exact preview, partial verification history does not blank review, imported default routes are absent, and no connector/VPN execution occurs. Zero runtime errors and no horizontal/dialog overflow.
- Source problem screenshots were inspected alongside the rendered desktop/mobile analysis. Additional event detail stays collapsed until requested. Native file selection and the paste alternative both work; credentials stay out of screenshots and output.
- P0/P1/P2: none in tested states. Limit: browser fixtures verify UI flow; actual device configuration and real VPN-server connectivity are not inferred from them. Optional external-provider analysis is not enabled pending authorization.
- Result: local and public release 165e661 passed. Public Chromium QA produced five captures, zero runtime errors/overflow, one reanalysis, one exact prepared plan and one synthetic VPN save; native chooser/paste passed, default route absent and executions zero. Desktop/mobile analysis, mobile action review and mobile import captures were visually inspected. All API evidence/actions/VPN saves use intercepted fixtures, not real account/device operations. Captures are temporary outside the repository.

---

# Design QA — Transparent EOSNET branding

- Date: 2026-10-14. Source: original user-supplied logo; explicit user choice is pixel-preserving transparency, not redraw.
- Local isolated Chromium run: 23 screenshots; zero page errors/overflow. Login desktop/tablet/mobile, English/RTL, loading/error/success, camera handoff and sidebar were checked. No real authentication or vendor operations.
- Visually inspected original/rendered lockup, mobile login, blue-background cutout and desktop/sidebar detail. PNG corner alpha is zero; no background rectangle remains. Shared raster layers animate only the original ray strips; original ring/wordmark stay static. Existing sidebar orbit dots remain.
- Reduced-motion and normal animation assertions pass. Frontend production build and scoped local web deployment are healthy. Public release verification is tracked separately.
- P0/P1/P2: none in tested surfaces. P3: original JPEG silhouette has a tiny dark fringe visible on a deliberately lighter test background, not a rectangular background; background/line icons/font rasterization remain reference derivatives.
- Result: passed. Temporary screenshots remain outside the repository.

- Public-site acceptance: the same 23-capture suite passes against `https://eosnet.ir/assets/cameras` after the manual 0f9dd83 release, including alpha corners, alternate-background cutout, actual delivered camera UI and EOSNET sidebar, normal/reduced motion, error/loading/success fixture states. Production PWA worker is bypassed only in the isolated test browser; application worker/auth behavior is unchanged. Original/public-render brand details were inspected together and the sidebar detail separately. No real camera/vendor operation or real user credential is used.

---

# Design QA — EOSNET Login

- Date: 2026-10-14
- Source: user-supplied `3.jpeg`, 844 × 1500 portrait; brand lockup is displayed from the supplied image, not approximated in SVG/CSS.
- Implementation: `src/components/auth/LoginPage.tsx`, `EosnetLogin.css`; existing protected routes show this login when signed out.
- Browser: isolated Chromium through the existing API image; auth requests are intercepted with fixtures. Captures are temporary under `eosnet-login-qa`, not committed.
- Final local run: 20 captures including camera-page handoff, zero page errors and no horizontal overflow. Public-server visual acceptance remains pending because this environment lost connectivity during deployment; local fidelity acceptance is not a production rollout claim.
- Reference viewport: 422 × 750 at DPR 2; resilience: 1440 × 900, 768 × 1024, 390 × 844, 320 × 568, 844 × 390, 720 × 450 zoom reflow and 390 × 420 keyboard-height layout.

## Comparison and iteration

- Full source/rendered images were inspected together at matching dimensions. The unframed centered hierarchy, original EOSNET geometry, dark navy background, language pill, security badge, heading, two fields and cyan-to-blue primary button follow the reference.
- Focused brand/form comparisons cover logo crop, wordmark, background integration, field/icon alignment, border radii, heading/form spacing and action weight. Existing IRANYekan matches the Persian visual style; Lucide user/eye/shield icons match the reference's line treatment.
- First pass found a faint logo-background rectangle, 7 px heading-spacing drift, inherited normal submit weight and background ending early on taller phones. Contrast/blend rendering, spacing, selector specificity and cover sizing corrected these findings. Placeholder sizing matches the reference while inputs remain 16 px to avoid mobile focus zoom; placeholder contrast is deliberately clearer than the mockup.
- The generated background was re-encoded from 1.43 MB PNG to 18 KB WebP. A generated logo variant was rejected; the supplied lockup is used instead.

## Interaction and accessibility

- Labels, password reveal, keyboard Tab/Enter, selected language, focus, busy/disabled submit, local validation, invalid credentials, rate limiting, service/database failures, changed-password notice and successful auth handoff were checked with mocked API responses.
- Repeated submit during a pending request produces one request. Reduced-motion disables decorative motion; normal motion is enabled otherwise. Mobile has no automatic focus/keyboard opening. No browser page errors or horizontal overflow were detected across tested layouts/states.
- Native compact/keyboard-height CSS was exercised in Chromium; physical Android/iOS acceptance is not claimed. Backend/session/CSRF mechanisms and controlled execution are unchanged.

## Findings and result

- P0/P1/P2: none remaining in the tested surfaces.
- P3: the background is a faithful derivative rather than a pixel-identical source extraction; line icon geometry and font rasterization vary slightly from the rendered mockup.
- Final result: passed.

---

# Design QA — Advanced Action Script Editor

- Date: 2026-10-10
- Reference source: user-provided assistant-card screenshot in the conversation
- Implementation: `/firewall/actions/:actionId/script-editor`
- Capture: ephemeral `.artifacts/action-script-editor.png` (reviewed locally and removed before commit)
- Viewport: 1440 × 1100 at device scale 1
- Tested state: verification tab selected, edited content present, preview successfully prepared, final apply action enabled

## Comparison

The implementation keeps the reference interaction model—editable proposed commands, an explicit edit/preview stage, and a separate confirm-and-apply action—while expanding it into a dedicated professional desktop workspace consistent with the existing Persian RTL product shell.

- Full view: navigation, device context, three-step progress, editor, safety guidance, preview summary, and final apply action are visible without broken layout or horizontal overflow.
- Focused editor: execution and verification are separate tabs; line numbers, copy/reset controls, validation feedback, and freely editable multiline content are clear.
- Action hierarchy: preview is secondary; “تأیید و اعمال روی وندور” is visually primary and remains disabled until a fresh valid preview exists.
- Product consistency: typography, colors, borders, spacing, RTL direction, and status treatments match the current application design language.

## Interaction and runtime checks

- Tab switching: passed
- Action detail entry point: passed; prominent “ویرایش اسکریپت قبل از اجرا” link is visible and opens the editor in a new tab
- Text editing: passed
- Preview request and ready state: passed
- Final action enablement after preview: passed
- Browser console errors: none
- Browser page errors: none
- Real vendor execution during design QA: intentionally not performed

## Findings

- P0: none
- P1: none
- P2: none
- P3: none; the wider desktop layout is an intentional usability expansion of the compact reference card.

## Final result

passed
