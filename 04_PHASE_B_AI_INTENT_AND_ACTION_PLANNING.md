# Phase B — AI Intent Routing and Action Planning

## Objective
Keep the Assistant as a normal general-purpose chat while deterministically converting true operation requests into executable, device-scoped ActionPlans.

## Required modes

Every message resolves to exactly one mode:

- `conversation`
- `device_question`
- `action_request`

Device selection supplies optional context only and must never force `action_request`.

## Deterministic explicit action markers

Add an explicit marker parser before heuristic/provider classification.

Force `action_request` when the normalized message starts with one of:

- `دستور:`
- `پرامپت:`
- `پرامت:`
- `command:`
- `prompt:`
- `/action `

Also support a compact frontend mode selector:

- `Auto`
- `Chat`
- `Action`

The UI mode is sent as `intentModeOverride`:

- `Chat` forces conversation unless the user changes the mode
- `Action` forces action planning
- `Auto` uses the routing pipeline

Do not treat a quoted/meta question such as `این دستور چه کاری می‌کند؟` as an action merely because it contains the word `دستور`. Prefix markers and explicit UI override are the deterministic signal.

## Routing pipeline

1. Validate optional UI override.
2. Detect explicit action marker.
3. Run deterministic classifier.
4. If confidence is below the configured threshold, ask the configured AI provider for a structured classification.
5. Validate provider output with a strict schema.
6. On ambiguity or provider failure, default to conversation/clarification, never execution.

Structured contract:

```ts
type AssistantResponseMode = "conversation" | "device_question" | "action_request";

type AssistantIntentResult = {
  mode: AssistantResponseMode;
  confidence: number;
  requiresClarification: boolean;
  reasonCode: string;
  explicitOverride: boolean;
};
```

## Conversation behavior

- Call the configured AI provider and return a normal answer.
- The user may discuss any unrelated subject even while a device is selected.
- No ActionPlan, Action Center handoff, connector call, or execution API call.

## Device-question behavior

- Answer using selected-device context, inventory, capabilities and safe read evidence when useful.
- Safe reads may be proposed through existing read-only paths if the user explicitly asks to fetch current state.
- No write ActionPlan unless the user clearly requests a change.

## Action-request behavior

1. Require a selected registered device or request device selection.
2. Bind the request to exact `deviceId`, vendor and platform.
3. Try catalog/template matching first.
4. If no catalog match exists, generate a structured custom AI ActionPlan.
5. Collect missing typed parameters.
6. Show source badge: `Catalog Action` or `AI Generated Action`.
7. Show commands, risk, impact, verification and rollback before approval.
8. Backend remains the only execution boundary.

## Custom AI ActionPlan contract

```ts
type CustomActionPlan = {
  schemaVersion: "custom_action_plan_v2";
  deviceId: string;
  vendor: string;
  platform: string;
  intent: string;
  source: "ai_custom";
  orderedOperations: Array<{
    id: string;
    operationType: string;
    typedParameters: Record<string, unknown>;
    generatedCommand?: string;
    dependsOn: string[];
  }>;
  missingFields: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  expectedImpact: string;
  verificationOperations: unknown[];
  rollbackGuidance: string[];
  requiresExplicitApproval: true;
};
```

The plan may contain generated commands, but those commands are data until the backend validates and compiles/dispatches them.

## Required tests

- selected Cisco + ordinary greeting => conversation, no plan
- selected MikroTik + unrelated advice => conversation, no plan
- selected device + memory/status question => device_question, no write plan
- `دستور: پورت SSH را به 22022 تغییر بده` => action_request
- `پرامپت: سرویس nginx را restart کن` => action_request
- `این دستور چه کاری می‌کند؟` => conversation/device_question, no execution
- UI `Chat` override prevents plan
- UI `Action` override creates plan
- catalog-backed action creates catalog plan
- unknown but valid vendor operation creates custom plan
- missing parameter collection works
- switching device clears stale plan and target context
- no chat message calls Action Center/execution routes
- Playwright verifies all three modes in Persian and English

## Commit

`feat(ai): separate chat device questions and explicit action planning`
