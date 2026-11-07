# Official stakeholder approval: M00 foundation baseline

Record PBSSU-APPROVAL-001. Approval date: 2026-11-07 (Asia/Kuala_Lumpur). Approving authority: project owner, through the explicit user instruction in this repository session titled "PBSSU RESCUE OPS — OFFICIAL STAKEHOLDER APPROVAL AND M00 BASELINE". No personal name, external signature or independent identity verification is invented.

This is approval evidence, separate from [technical validation](../testing/APPROVED-BASELINE-VALIDATION.md). It supersedes the PENDING statuses recorded during M00.1/M00.2 for the following decisions only.

| Decision | Recorded approval |
| --- | --- |
| Q-01 | APPROVED: tenant-scoped deny-by-default RBAC, six role templates, exact permission keys, restricted delegation and no automatic platform-admin access to tenant operational data. The dedicated self/proof-bound handoff capability is not a tenant/platform escalation. |
| Q-03 | APPROVED: local email/password, Argon2id, privileged TOTP MFA, rotating/revocable refresh sessions, guarded invitation activation and secure recovery. Account password recovery never removes/replaces MFA. All-factor MFA recovery remains separately controlled and unavailable without the required custodians/evidence procedure. |
| Q-04 | APPROVED AS IMPLEMENTATION BASELINE: Node24, Nest12.x, PostgreSQL18, PostGIS3.7, Kysely + pg, explicit SQL migrations and npm workspaces. Exact patch locks/image digests/native/peer/runtime compatibility remain verification gates, not approved test results. |
| C-02 | APPROVED POLICY: future real onboarding uses an approved email invitation channel; M01 uses only synthetic identities and a controlled mock mail adapter with no real outbound messages. Explicit short-lived one-time invitation/credential provisioning handoffs must be protected, never logged or included in generic responses/audits, and never bypass authentication/MFA. An authorized local test mailbox may expose synthetic links only. No production secret delivery is authorized. |

The concrete contract interpretation is documented in [C-02 handoff policy](../security/CREDENTIAL-HANDOFF.md) and ADR-013. Generic API responses remain metadata-only; sensitive release is explicit and isolated to the dedicated bound redemption operation. This is not a blanket secret-response exception.

Authorized work in this turn: documentation/contract alignment, revalidation, freeze recalculation and one local documentation-baseline commit if validation passes. Push, M01 implementation, application scaffolding, dependency installation, Docker/container changes, deployment, production delivery and real-user provisioning are NOT authorized.

Remaining feature/pilot questions Q-02/Q-05–Q-10 are not implicitly approved. React/Vite and Flutter/encrypted SQLite exact package selections were not included in the expressly approved backend Q-04 list; their later verification/selection gates remain. Approved policy is not implementation evidence.
