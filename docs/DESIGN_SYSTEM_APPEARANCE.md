# EOSNET appearance and typography

The operator's October 18 reference image is the light-theme source of truth.
`src/design-system/appearance.css` owns the light overrides for legacy, app,
SOC and utility token families. Do not add independent light palettes in pages.

| Role | Value |
| --- | --- |
| Primary action / selection | Indigo `#4F46E5` |
| Secondary visual accent / camera / CPU curve | Teal `#0D9488` |
| Workspace canvas | Slate `#F8FAFC` |
| Card / dialog | White `#FFFFFF` |
| Main text | Slate `#0F172A` |
| Secondary text | Slate `#475569` |
| Border / empty chart track | Grey `#E2E8F0` |
| Healthy indicator | Emerald `#10B981` |
| Warning indicator | Amber `#F59E0B` |
| Critical indicator | Rose `#F43F5E` |

Small semantic text uses darker related shades (`#047857`, `#92400E`,
`#BE123C`) on pale backgrounds. Keep status words/icons as well as color.
Primary buttons use white on indigo, hover uses `#4338CA`. Focus remains visible.
Camera video stages retain their intentional dark background and original pixels.
Login/marketing retain their branded artwork. Dark-theme colors remain intact.

## Shared type hierarchy

`src/design-system/typography.css` applies to both appearances and portaled
dialogs. IRANYekan remains the Persian UI family. At the default browser size:

| Role | Size | Weight |
| --- | --- | --- |
| H1 / page | 24px | 700 |
| H2 / section | 21px | 700 |
| H3 / card | 18px | 700 |
| H4–H6 / subordinate title | 16px | 700 |
| Body / table / desktop form | 14px | 500 |
| Caption / small supporting text | 12px | inherited |

Use semantic headings, not a heading element solely to enlarge a number.
Heading rules deliberately win over older lazy-loaded page CSS, so switching
routes or themes cannot restore an incompatible heading scale. Heading line
height is 1.5, body 1.75; sizes use rem for browser text scaling. Numeric KPIs,
charts and code keep their own purpose-specific styles. Mobile form fields stay
16px to prevent iOS focus zoom; titles do not shrink below their hierarchy.

Browser theme preference stays in Settings > Appearance and is applied before
React, persisted locally and synchronized across tabs. Startup/runtime browser
theme colors must both match the light canvas.

## Verification

`scripts/qa/capture-appearance.mjs` uses intercepted synthetic APIs to check
palette, computed heading sizes/weights in both themes, actual chart rendering,
unknown/offline gauges, sampled text contrast, theme persistence, keyboard,
viewer access, desktop/mobile/320px, dialogs and English. It never changes
customer devices or server settings. Existing community/NVR browser fixtures
cover denser forms, dialogs and mobile workspaces.
