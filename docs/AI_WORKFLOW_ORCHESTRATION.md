# AI Workflow Orchestration

## Current State

AI remains proposal-first and bounded by the existing Mini-SOAR execution contract. This milestone only adds asset/finding context to reviewed ActionPlans created from security findings.

## Safe Pattern

`Finding context -> reviewed ActionPlan -> preview -> user confirmation -> PolicyGuard -> connector -> audit/result`

No AI workflow may execute raw shell text. No finding-created plan is marked succeeded unless the normal connector execution path later runs and records `connectorInvoked=true`.

## Future Scope

Future AI orchestration can add guided investigation checklists, evidence summaries, remediation comparisons, and runbook suggestions. It must reuse catalog/guided/action infrastructure rather than inventing a parallel execution path.
