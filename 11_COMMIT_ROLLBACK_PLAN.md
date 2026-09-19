# Commit and Rollback Plan

## Phase commits

1. `test(baseline): freeze security assistant and workflow behavior`
2. `feat(security): enforce RBAC rate limits and CSRF protection`
3. `feat(ai): separate chat device questions and explicit action planning`
4. `refactor(actions): add extensible vendor command policy engine`
5. `refactor(actions): decompose action plan services`
6. `refactor(ai): decompose assistant routing and planning`
7. `refactor(ui): modularize assistant and action center workflows`
8. `chore(prod): harden deployment docs and review bundles`
9. `feat(mobile): add secure PWA and Capacitor-ready foundation`
10. `test(stability): lock security workflow and mobile acceptance`

## Staging rules

- Stage explicit files or use `git add -p`.
- Never use `git add .` while unrelated deleted/untracked files exist.
- Before each commit:

```bash
git diff --cached --stat
git diff --cached --check
git diff --cached
```

## Rollback

- A failed phase is reverted independently; later phases must not depend on an uncommitted failed phase.
- Prefer `git revert <phase-commit>` after a commit.
- Before commit, use `git restore -p` only on scoped files.
- Never reset or clean the entire worktree because unrelated user changes may exist.
- Preserve database migrations and local data unless the phase explicitly includes a reviewed migration.

## Stop conditions

Stop and report instead of improvising when:

- a real-device destructive test would be required
- a production/development database could be modified by a test
- a route cannot be assigned an unambiguous permission
- an unknown custom command cannot be safely parsed
- a new dependency has unresolved security/maintenance concerns
- unrelated baseline tests fail before the phase change
