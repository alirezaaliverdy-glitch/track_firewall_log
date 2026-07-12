# UX Information Architecture

## Implemented

Two compact top-level views were added:

- `/assets`: asset inventory, selected asset summary, and grouped sync controls.
- `/security`: findings, detection rules, and remediation handoff.

The UI is intentionally grouped and compact. It avoids trying to expose every future platform phase at once.

## Navigation

The app header now includes:

- Dashboard
- Action Library
- Assets
- Security

## Future Scope

Future views should stay operator-focused: dense enough for repeated daily use, grouped by workflow, and careful not to blur preview/review/execution states.

## Task 18.1 IA Update

Milestone A expands the IA from compact `/assets` and `/security` pages to a grouped platform shell. Implemented routes are active; future routes show planned state. Mock integrations are moved into `/integrations` and `/assets/sync` surfaces with explicit mock labeling.
