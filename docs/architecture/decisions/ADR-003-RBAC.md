# ADR-003: Tenant membership and RBAC

Date 2026-11-06; decision updated 2026-11-07. Status: APPROVED 2026-11-07: Q-01 deny-by-default tenant RBAC/exact keys/six role templates; no implicit platform access.

Context: one user can serve several organizations in different roles.

Decision: global users/sessions, organization memberships and tenant-local roles/role_permissions/membership_roles. Every protected operation validates current membership, permission, assignment and sensitive-field scope. Platform bootstrap capability is separate from tenant roles; no automatic operational access.

Alternatives: one global role cannot represent tenant differences; client-only checks are insufficient.

Consequences: permission changes/revocation must affect subsequent requests, not wait for stale token expiry. Grant delegation cannot exceed the grantor's allowed set. Q-01/Q-03 govern the final matrix/session model; T-002/003/004/N01 cover it.

M00.1 refinement, approved under Q-01 on 2026-11-07: [authorization model](../../security/AUTHORIZATION-MODEL.md) defines exact operation permission groups, role templates, DENY defaults, TENANT/ASSIGNED grant scopes and delegation bounds. Explicit delegation catalogue is distinct from personal operational rights; no actor may widen their own grants or held roles. It refines the earlier illustrative matrix under the recorded stakeholder acceptance; the blueprint-approved direction above is unchanged.

Approval authority and limits: [project-owner record](../../planning/STAKEHOLDER-APPROVAL-2026-11-07.md). Historical M00/M00.1/M00.2 validation results remain dated prior evidence; no compatibility/security result is approved by this status update. Do not start M01, send real mail or deploy under this baseline commit.
