# ADR-013: Approved bounded credential handoff and mock delivery

Date 2026-11-07. Status: ACCEPTED POLICY/DESIGN BASELINE under [explicit project-owner approval](../../planning/STAKEHOLDER-APPROVAL-2026-11-07.md). No runtime/security acceptance result.

Context: M00.2 intentionally blocked C-02 rather than assuming a secret-response exception. The owner now authorizes explicit narrowly scoped invitation/credential provisioning while prohibiting generic response/audit/log disclosure and real delivery in M01.

Decision: purpose/subject/client/proof-bound one-time credential_handoffs; generic metadata handles only; redeemCredentialHandoff alone returns sensitive custom-media material or web session cookies after required proof. SESSION, TOTP_SETUP and RECOVERY_CODES have separate guards and short release lifetimes. Invitation mail stays out of generic responses. M01 mock mail accepts synthetic identities only, no outbound network/fallback; private test mailbox access is local and authorized. Production sender/provider, real seed/code delivery and all-factor recovery custody remain separate authorization gates.

Alternatives: generic JSON token/seed fields, email-only MFA reset/provisioning and raw-secret response replay caches are excluded. A global platform-admin bypass is excluded. No additional operational role grants are introduced.

Consequences: OpenAPI0.3.0 adds one non-tenant BOUND_HANDOFF capability and one restricted global logical entity (75 operations/40 entities). Exact modes, storage/proof/CSRF/redaction and failure behavior are in [handoff policy](../../security/CREDENTIAL-HANDOFF.md). Q-04 patch/digest/runtime verification remains required. This baseline commit does not authorize M01 scaffolding, installs, Docker changes, production delivery or deployment.
