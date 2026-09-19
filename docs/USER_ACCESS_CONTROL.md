# User access control

The application uses two restrictive layers:

1. A role (`viewer`, `operator`, or `admin`) defines which operations the user may perform.
2. `allowedSections` defines where a non-admin may use those operations: dashboard, assets, security, monitoring, actions, assistant, or attackers.

Access is granted only when both layers permit the request. Admins have all sections and the `users.manage` permission. Viewer and operator accounts must have at least one explicit section.

## Enforcement and lifecycle

- Backend API paths are mapped to product sections and checked after authentication on every request.
- Product navigation is filtered server-side and direct frontend routes apply the same section grants.
- Role, status, or section changes revoke all sessions for the affected account, requiring a fresh login.
- Initial and reset passwords use the shared password policy and bcrypt cost 12.
- An administrator cannot demote or deactivate their own account through the management API.
- The last active administrator cannot be demoted or deactivated.
- Password reset for the current account remains in the personal security tab and requires the current password.
- User-management changes write audit events without password material.

This model follows NIST's role-based permission model and OWASP's least-privilege, deny-by-default, server-side authorization guidance. Nonessential sidebar motion honors the W3C reduced-motion accessibility recommendation.

References:

- https://csrc.nist.gov/Projects/role-based-access-control/faqs
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
