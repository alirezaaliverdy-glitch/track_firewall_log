# Phase 1 - Authentication Boot Architecture

Goal:
Prevent unnecessary application loading before authentication state is known.

Analyze:
- src/main.tsx
- src/App.tsx
- auth provider
- router initialization
- ProtectedRoute

Expected target:

Application start
|
|-- session check
|
|-- unauthenticated -> login shell only
|
|-- authenticated -> load dashboard/application

Requirements:
- No API contract changes
- No UI changes
- Preserve routing

Validation:
- npm run build
- tsc
- production preview timing
- login flow test

Report before implementation.