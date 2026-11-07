# ADR-012: Candidate identity contract and foundation freeze

Date 2026-11-06; decision updated 2026-11-07. Status: APPROVED FOUNDATION BASELINE 2026-11-07; earlier unresolved C-02 restriction superseded by accepted policy/contract ADR-013. No M01 implementation authorization.

Context: C-01 identified Session-only login, missing MFA/recovery/session APIs, direct membership activation and absent proof/factor/refresh storage.

Candidate decision: align OpenAPI0.2.0 and 39 logical entities, explicit role scope DTOs and operation-key catalogue, single-use bound challenge/proof lifecycle, ONBOARDING/invitation intent and guarded first-admin activation. Replace createMembership with inviteMember. Keep global identity/audit restrictions and tenant invitation RLS/composite FKs; no platform operational bypass.

Current decision: generic responses/audits/logs remain secret-free. ADR-013 explicitly resolves C-02 with one-time subject/purpose/client-bound handoffs and mock-only synthetic M01 email. OpenAPI0.3.0 has 75 operations/40 logical entities. Acceptance is approval of policy and documentation, not runtime verification or authorization to begin M01. [Readiness](../../planning/M01-READINESS.md) and current approval/validation records govern the review boundary.

Approval authority and limits: [project-owner record](../../planning/STAKEHOLDER-APPROVAL-2026-11-07.md). Historical M00/M00.1/M00.2 validation results remain dated prior evidence; no compatibility/security result is approved by this status update. Do not start M01, send real mail or deploy under this baseline commit.
