# M01 readiness after official M00 baseline approval

PBSSU-READY-001 v0.3.0, 2026-11-07. **Foundation policy/contract entry decisions resolved; ready for explicit M01 implementation authorization, which has NOT been given.** [Owner approval](STAKEHOLDER-APPROVAL-2026-11-07.md) is not runtime/security evidence.

| Gate | Current state |
| --- | --- |
| Q-01 | APPROVED tenant RBAC/exact grants/six roles; no operational platform bypass. |
| Q-03 | APPROVED local Argon2id/TOTP/rotation/invitation/recovery policy; account recovery never removes MFA. |
| Q-04 | APPROVED backend implementation families; exact lock/image/native/runtime checks remain G-RUNTIME. |
| C-01 | ALIGNED OpenAPI0.3.0, 75 operations, 40 logical entities and reconciled requirements/security scopes. |
| C-02 | RESOLVED_POLICY_CONTRACT through explicit [one-time dedicated handoff](../security/CREDENTIAL-HANDOFF.md). Generic responses remain metadata-only. M01 mock/synthetic mail only; no production delivery. |
| M01 start | NOT AUTHORIZED. Stop after documentation baseline commit, no scaffold/install/Docker/deploy/start. |

C-02 delivery-adapter behavior, cryptographic/redaction/CSRF/session checks and zero-outbound mock controls are future implementation/acceptance tasks, not unresolved stakeholder policy. Real provider/sender/key/recovery ownership and production secret delivery remain separately gated.

## Exact proposed backend-only M01 scope after explicit M01 authorization

1. Use the recorded approvals/OpenAPI0.3.0 and implement the explicit C-02 mock-only handoff contract; do not widen delivery scope. Preserve the approved stack, deny defaults and tenant isolation.
2. Establish Node24/npm-workspace tooling and Nest12 backend only; select exact reviewed dependencies/peers, package lock, lint/type/test scripts and CI. No React/Flutter scaffolds in this scope.
3. Configure reviewed PostgreSQL18/PostGIS3.7 image digest and Kysely0.29.8/pg migration tooling in an explicitly approved disposable local environment. Use distinct owner/migrator, tenant runtime and restricted identity/bootstrap roles; validate extension/version inventory.
4. Create reviewed migrations for the 22 foundation entities: organizations, users, sessions, memberships, roles, permissions, role_permissions, membership_roles, audit_logs, password_credentials, session_refresh_tokens, mfa_credentials, recovery_codes, auth_challenges, account_action_tokens, organization_invitations, invitation_roles, identity_audit_logs, identity_delivery_jobs, platform_grants, organization_settings and credential_handoffs. Apply UUID/UTC, relevant RLS/composite/unique constraints and proof/session identity invariants. Do not create incident/media/sync/report domain implementation.
5. Implement the 40 foundation contract operations: all 26 identity/session/proof capabilities, both platform metadata operations and 12 tenant foundation operations (getOrganization, updateOrganization, inviteMember, revokeInvitation, listPersonnel, updatePersonnel, setMembershipRoles, listRoles, createRole, listPermissions, getSettings, updateSettings). Define the entire approved permission catalogue, but implement no operational feature handler. Exclude listAuditLogs UI/API delivery from M01; audit writes/redaction and restricted identity auditing are in scope, tenant audit reader follows later.
6. Implement Argon2 local credentials, generic verification/reset, privileged MFA/challenges/code handling, controlled mock-only mail and dedicated handoff procedure, refresh rotation/revocation and owned sessions; invitation acceptance plus guarded first-admin/member activation. Synthetic mail/provisioning adapters must exercise the approved controls, never bypass MFA or activate a fake verified session.
7. Implement active-context resolution, explicit role/scope/delegation and assurance guards, transaction-bound tenant repositories, DTO validation, standardized redacted errors/audits and OpenAPI conformance. Prove isolation using synthetic tenant membership/role/settings rows; no incident app needed to exercise database isolation.
8. Execute and report lint/type/unit/contract and PostgreSQL integration checks: fresh/upgrade/failing migrations; composite FK attacks; missing/malformed context; SELECT/INSERT/UPDATE/DELETE under actual runtime role; pool-size-one alternation/rollback/concurrency; staged invite/MFA activation; reset preserving MFA; refresh ancestor reuse/races; immediate revocation; no secret projections/audit/log capture; platform denial of tenant resources.

The 22 foundation tables are a subset of the 40 logical entities; remaining operational tables stay documented for later migrations. The 40-operation count is a scope inventory, not implemented coverage. Foundation estimate must be re-estimated for real capacity/MFA/delivery decisions; the old two-week hypothesis is not a commitment.

## Verification and later gates

Engine access, exact package peers/locks/image digest, native Argon2, actual migrations/RLS/pool/atomic handoffs and client transport are unverified. Controlled mock mail/private mailbox and no-outbound configuration must be implemented/tested with synthetic identities only; do not run provider credentials or real messages in M01. Production provider/operational custody/recovery readiness and explicit production delivery authorization are separate.

Q-02/Q-05–Q-10 remain open at their operational feature/pilot gates. Frontend/mobile scaffolds, operational incident/media/sync/report features, production migrations and deployment remain outside this M01 proposal.

See [approval evidence](STAKEHOLDER-APPROVAL-2026-11-07.md), [technical validation](../testing/APPROVED-BASELINE-VALIDATION.md), [decision register](DECISION-REGISTER.md) and [approved freeze](FOUNDATION-FREEZE.json). Approval of policy/documentation is not approval to begin M01.
