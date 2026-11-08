# Sprint 3-E Tenant-Only Privileged MFA Remediation

Date: 2026-11-08
Branch: `feat/sprint-3-incident-backend`
Base commit: `9fd2a4b6bdb26a61ca0370ee7d9e85e648acbcf0`

## Finding and root cause

The high-severity finding was valid. Login privilege discovery queried tenant memberships and role grants without the actor and tenant context required by FORCE RLS. The identity connection therefore saw no tenant privilege rows for a tenant-only Commander or Control Room Operator. The existing Sprint 3-D Commander fixture also had a platform-level `listOrganizations` grant, which caused MFA independently and masked the bug.

The relevant RLS policy is the existing `own_membership_metadata` policy in `apps/api/src/database/migrations/001-foundation.ts` (line 73). It permits `pbssu_m01_identity` to select membership metadata only when the row's `user_id` equals the transaction-local trusted `app.actor_user_id`. Role and grant queries additionally require the tenant's `app.organization_id` context.

## Remediation

`apps/api/src/identity/identity.service.ts` now has a shared transaction-aware privilege lookup (approximately line 1619). It:

1. Binds the verified server-side subject as `app.actor_user_id`.
2. Reads only that subject's active membership tenant IDs through the existing RLS policy.
3. Sets each tenant context from those rows and checks existing active role grants against `permissions.requires_privileged_mfa`.
4. Checks the subject's platform grants independently, without making tenant privilege detection depend on them.
5. Restores prior transaction-local context, including when called inside invitation transactions.
6. Propagates errors and treats missing result rows as errors; a failed lookup cannot downgrade the subject to password-only assurance.

Login (approximately line 2628), recent-MFA checks, invitation acceptance, and invitation activation now use the shared lookup. No security-definer function, broad lookup, BYPASSRLS role, migration, permission, role grant, table, or API operation was introduced.

## Validation and decision

The dedicated real-HTTP tests cover tenant-only Commander and Operator credentials with no platform grants; a multi-tenant Operator; an ordinary password-only responder; and a platform-only administrator with no tenant membership. MFA is challenged and completed for the tenant-only privileged users. A password-only responder is denied incident creation. MFA for one tenant does not authorize incident access in another. A platform-only administrator remains unable to read tenant incidents after MFA. An expired MFA challenge is rejected. A controlled failure probe temporarily removes the identity role's membership SELECT privilege, verifies generic HTTP failure and no session/challenge/handoff mutation, then restores the grant in `finally`.

The expanded integration suite passed 36 tests across five files; unit/contract tests passed 17 tests across two files. Formatting, lint, typecheck, build, Sprint 2/3 scope checks, and `git diff --check` passed. Exact commands and test boundaries are recorded in [Sprint 3-E MFA Remediation Validation](../testing/SPRINT-3E-MFA-REMEDIATION-VALIDATION.md).

**Recommendation: PASS for the local remediation acceptance gates.** Sprint 3 remains within its frozen contract. This remediation does not authorize merge, push, deployment, or Sprint 4. Remaining risks include production logging/key-management verification and open gates M01-R01, Q-05, Q-06, and Q-08.
