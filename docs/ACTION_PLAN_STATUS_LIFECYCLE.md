# ActionPlan Status Lifecycle

This is the intended ActionPlan status vocabulary for the next status-system refactor. It documents frontend labels and product semantics only; current backend persistence and transitions are unchanged.

| Status | Frontend label | Meaning |
| --- | --- | --- |
| `proposed` | proposed | The action exists but has not completed validation and command planning. |
| `needs_input` | needs input | Operator input is required before validation or planning can continue. Current backend often represents this as `proposed` with missing-field validation details. |
| `validation_failed` | validation failed | Policy validation or command compilation found blocking issues. |
| `awaiting_approval` | awaiting approval | The action passed validation and is waiting for explicit operator approval. |
| `dry_run_ready` | dry run ready | A deterministic command plan exists and no device changes have been executed. |
| `running` | running | Controlled connector execution is in progress. Current backend persists this as `executing`. |
| `succeeded` | succeeded | Execution completed successfully. |
| `failed` | failed | Execution or connector handling failed. |
| `blocked` | blocked | Policy, catalog, device, credential, or operator constraints block execution. Current backend often represents this as `validation_failed` or a request error. |
| `rollback_needed` | rollback needed | Execution finished in a state that requires operator rollback or remediation. |
| `rolled_back` | rolled back | Rollback completed or was recorded as completed. |

Compatibility notes:

- Backend statuses `approved`, `rejected`, and `executing` remain supported by the frontend until backend transitions are normalized.
- Frontend labels should display each status distinctly; do not collapse `proposed`, `awaiting_approval`, and `dry_run_ready` into a generic ready state.
