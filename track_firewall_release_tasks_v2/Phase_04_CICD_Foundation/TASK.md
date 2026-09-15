# Phase 04 - CI/CD Foundation

Goal:
Create a reliable production pipeline.

Tasks:
1. Audit current package scripts.
2. Create GitHub Actions CI workflow.
3. Add:
- install dependencies
- TypeScript check
- lint if available
- production build
- artifact verification

Create release workflow:
- protected main/tag trigger
- build artifact
- release metadata
- rollback-friendly structure

Rules:
- No UI changes.
- No API changes.
- No auth changes.

Validation:
- npm run build
- typecheck
- workflow syntax check

Report:
changed files, risks, validation, next phase.