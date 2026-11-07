# ADR-009: Local credentials, privileged MFA and revocable sessions

Date 2026-11-06; decision updated 2026-11-07. Status: APPROVED POLICY 2026-11-07: Q-03 identity/MFA/recovery/session baseline and C-02 explicit handoff; not runtime evidence.

Context: the requested MVP recommendation needs secure enrollment, multiple memberships, lost-factor recovery and immediately revocable sessions.

Recommendation: local verified email/password with Argon2id; invitation-based membership enrollment; privileged TOTP MFA and hashed recovery codes; short access JWTs with authoritative session checks; opaque rotating refresh token families with ancestor-reuse detection. Password reset revokes sessions and cannot remove MFA. Lost-factor manual recovery requires separately approved custodians and evidence, never an admin bypass.

Alternatives: external identity provider remains a later integration option; password-only privileged access and email-only MFA reset are rejected recommendations. No external auth provider selected or provisioned.

Consequences: global identity tables and contract changes are required before M01 auth code, including login challenge responses. Architecture/MFA policy is approved; working parameter checks and sender/custody operational readiness remain implementation/real-use gates. Native Argon2 binding and mail adapter compatibility require future checks. Details and sources: [authentication architecture](../../security/AUTHENTICATION-ARCHITECTURE.md). Planned tests extend T-002/T-N02/T-N03; none executed as product tests.

Current approved contract is OpenAPI0.3.0 with 40 logical entities and exact permission/traceability mappings. C-02 is resolved by ADR-013's isolated one-time handoff, not generic secret-bearing responses. Mock-only synthetic delivery in M01 and separate production/provider/custody gates remain mandatory.

Approval authority and limits: [project-owner record](../../planning/STAKEHOLDER-APPROVAL-2026-11-07.md). Historical M00/M00.1/M00.2 validation results remain dated prior evidence; no compatibility/security result is approved by this status update. Do not start M01, send real mail or deploy under this baseline commit.
