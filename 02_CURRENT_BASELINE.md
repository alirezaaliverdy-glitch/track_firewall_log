# Current Project Baseline

This task bundle is written against the reviewed project snapshot.

## Stack

- Frontend: React 19, Vite 7, TypeScript, React Router, i18next, Tailwind
- Backend: Fastify 5, Prisma 7, PostgreSQL, ssh2
- Auth: opaque database-backed session cookie
- Vendors: Cisco, MikroTik, FortiGate, Linux
- Core flow: ActionPlan, PolicyGuard, connectors, verification, audit

## Existing relevant implementation

- `backend/src/ai/assistant-intent-classifier.ts`
  - modes: `conversation | device_question | action_request`
  - current classification is deterministic heuristic-based
- `backend/src/ai/custom-action-plan.ts`
  - custom connector-backed ActionPlan exists
  - command safety is currently embedded as vendor-specific regular expressions
- `backend/src/services/ai-chat.service.ts`
  - selected-device context and ActionPlan handoff exist
- `backend/src/services/action-plan.service.ts`
  - execution pipeline and lifecycle are concentrated in one very large service
- `backend/src/services/auth.service.ts`
  - roles exist: `admin | operator | viewer`
- `backend/src/routes/auth.ts`
  - login has a local in-memory attempt limiter only
- `backend/src/app.ts`
  - cookie auth preHandler exists
  - no centralized route permission policy
  - no application-wide rate-limit plugin
  - no mutation CSRF guard
- `backend/src/routes/health.ts`
  - `/api/health/live` and `/api/health/ready` already exist; extend rather than replace

## Large files requiring behavior-preserving refactor

- `backend/src/services/action-plan.service.ts` ~102 KB
- `backend/src/services/fortigate-command-compiler.ts` ~68 KB
- `src/components/actions/ActionCenterPanel.tsx` ~64 KB
- `src/components/ai/AiSecurityAssistantPanel.tsx` ~60 KB
- `backend/src/guided-actions/vendors/fortigate/fortigate-blueprints.ts` ~57 KB
- `backend/src/connectors/linux-ssh.connector.ts` ~55 KB
- `src/components/actions/ActionCenterWorkspace.tsx` ~44 KB
- `backend/src/services/ai-intent.service.ts` ~42 KB
- `backend/src/services/ai-chat.service.ts` ~41 KB

## Known high-priority gaps

1. Central RBAC/permission enforcement is incomplete.
2. Rate limiting is not centralized or route-specific.
3. Cookie-auth mutations lack a complete CSRF/origin contract.
4. AI action intent needs a deterministic explicit override plus provider fallback.
5. Custom command policy is embedded and hard to extend.
6. Several core files are too large and regression-prone.
7. Development Docker settings are not production-safe.
8. Runtime DB and backup data are included in review archives.
9. Documentation contains overlapping/legacy sources of truth.
10. The frontend is responsive but not yet an installable PWA or Capacitor-ready application.
