# Design QA — EOSNET Login

- Date: 2026-10-14
- Source: user-supplied `3.jpeg`, 844 × 1500 portrait; brand lockup is displayed from the supplied image, not approximated in SVG/CSS.
- Implementation: `src/components/auth/LoginPage.tsx`, `EosnetLogin.css`; existing protected routes show this login when signed out.
- Browser: isolated Chromium through the existing API image; auth requests are intercepted with fixtures. Captures are temporary under `eosnet-login-qa`, not committed.
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
