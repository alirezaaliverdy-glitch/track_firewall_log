# Phase E — Frontend Refactor and Permission-Aware UX

## Objective
Decompose oversized UI components and integrate intent/RBAC behavior without redesigning unrelated pages.

## AI Assistant decomposition

Suggested structure:

```text
src/features/assistant/
  AssistantPage.tsx
  components/
    AssistantHeader.tsx
    AssistantModeSelector.tsx
    AssistantDeviceContext.tsx
    AssistantMessageList.tsx
    AssistantComposer.tsx
    AssistantPlanPreview.tsx
    AssistantMissingFields.tsx
    AssistantSafetyBoundary.tsx
  hooks/
    useAssistantSession.ts
    useAssistantIntent.ts
    useAssistantPlan.ts
  api/assistant.api.ts
  types.ts
```

Requirements:

- preserve normal chat
- show `Auto | Chat | Action` compact selector
- show selected device as context, not forced mode
- display response mode for debugging only in development
- show `Catalog Action` vs `AI Generated Action`
- never auto-navigate on ordinary chat
- plan/review controls only appear for `action_request`
- device switch clears stale plan state

## Action Center decomposition

```text
src/features/actions/
  ActionCenterPage.tsx
  components/
    ActionList.tsx
    ActionFilters.tsx
    ActionReviewSheet.tsx
    ActionRiskSummary.tsx
    ActionCommandPreview.tsx
    ActionApprovalControls.tsx
    ActionExecutionTimeline.tsx
    ActionVerificationResult.tsx
  hooks/
  api/
```

Use an inline panel on desktop and a bottom sheet on narrow screens.

## Permission-aware UI

- Add typed frontend permission helpers derived from authenticated role.
- Disable/hide forbidden controls with a clear Persian/English reason.
- Do not duplicate server business rules; frontend permission mapping is UX only.
- Viewer sees read-only data and cannot open execution confirmation.
- Operator cannot access credential management or high-risk execution.

## Accessibility and mobile constraints

- touch targets >= 44px
- keyboard focus and dialog focus trap
- `aria-live` for execution progress
- correct RTL/LTR icon direction
- no horizontal overflow at 390px
- long command lines scroll inside their own container

## Required Playwright paths

- `/assistant` in Persian and English
- normal chat with selected device
- device question
- explicit action marker
- manual Chat and Action mode overrides
- Action Center desktop review
- 390px mobile review bottom sheet
- viewer/operator/admin UI states
- zero browser console errors

## Commit

`refactor(ui): modularize assistant and action center workflows`
