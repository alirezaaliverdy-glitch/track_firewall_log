# Case Management

## Current State

This milestone does not add full case management tables. Findings can be acknowledged or moved through existing Finding status fields, and a Finding can create a reviewed ActionPlan for remediation follow-up.

## Future Scope

Planned case management should add:

- Case records linked to assets, findings, events, and actions.
- Owner, priority, SLA, status, and resolution fields.
- Comments, timeline, attachments, and audit trail.
- Case queues and compact operator views.

## Boundary

Do not overload ActionPlans as cases. ActionPlans remain remediation proposals/executions; cases should become the investigation container in a later task.
