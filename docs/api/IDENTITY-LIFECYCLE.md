# M00.2 identity lifecycle and guard contract

PBSSU-IDFLOW-001 v0.3.0, 2026-11-07; approved policy baseline, not implementation/runtime evidence. OpenAPI0.3.0 x-identity-lifecycles is the machine-readable transition catalogue; this table is its readable mirror. Missing transitions deny. Expiry uses server UTC.

| Entity | From | To | Trigger |
| --- | --- | --- | --- |
| organizations | ONBOARDING | ACTIVE | activateInvitation |
| organizations | ACTIVE | SUSPENDED | restrictedAdministration |
| organization_invitations | PENDING | ACCEPTED | acceptInvitation |
| organization_invitations | ACCEPTED | AWAITING_MFA | acceptInvitation |
| organization_invitations | ACCEPTED | ACTIVATED | activateInvitation |
| organization_invitations | AWAITING_MFA | ACTIVATED | activateInvitation |
| organization_invitations | PENDING | REVOKED | revokeInvitation |
| organization_invitations | PENDING | EXPIRED | expiry |
| organization_invitations | ACCEPTED | REVOKED | revokeInvitation |
| organization_invitations | ACCEPTED | EXPIRED | expiry |
| organization_invitations | AWAITING_MFA | REVOKED | revokeInvitation |
| organization_invitations | AWAITING_MFA | EXPIRED | expiry |
| auth_challenges | PENDING | CONSUMED | successfulProof |
| auth_challenges | PENDING | EXPIRED | expiry |
| auth_challenges | PENDING | LOCKED | attemptLimit |
| auth_challenges | PENDING | REVOKED | credentialChange |
| sessions | PENDING_DELIVERY | ACTIVE | redeemCredentialHandoff |
| sessions | PENDING_DELIVERY | EXPIRED | expiry |
| sessions | PENDING_DELIVERY | REVOKED | revocation |
| sessions | ACTIVE | REVOKED | revocation |
| sessions | ACTIVE | EXPIRED | expiry |
| session_refresh_tokens | ACTIVE | CONSUMED | refreshSession |
| session_refresh_tokens | ACTIVE | REVOKED | revocation |
| session_refresh_tokens | ACTIVE | EXPIRED | expiry |
| mfa_credentials | PENDING | ACTIVE | confirmMfaEnrollment |
| mfa_credentials | ACTIVE | RETIRED | confirmMfaReplacement |
| mfa_credentials | PENDING | REVOKED | expiry |
| memberships | PENDING_ACTIVATION | ACTIVE | activateInvitation |
| memberships | PENDING_ACTIVATION | INACTIVE | revokeInvitation |
| memberships | ACTIVE | INACTIVE | updatePersonnel |
| memberships | INACTIVE | PENDING_ACTIVATION | acceptInvitation |
| memberships | PENDING_ACTIVATION | INACTIVE | expiry |
| credential_handoffs | READY | CONSUMED | redeemCredentialHandoff |
| credential_handoffs | READY | EXPIRED | expiry |
| credential_handoffs | READY | REVOKED | credentialChange |

## Guards and atomicity

- ONBOARDING organization is not operationally usable. onboardOrganization creates only a FIRST_ADMIN invitation and reserved Organization Admin template intent. No membership_roles or privileged session.
- acceptInvitation validates a hashed purpose-bound proof, bound recipient and existing-user authentication (new_password cannot reset an existing account). It consumes the proof once, binds recipient and creates only PENDING_ACTIVATION membership. Intended privileged grants require MFA even before they are effective.
- verifyMfa/confirmMfaEnrollment consume their own challenge and issue a fresh successor COMPLETE_INVITATION challenge where applicable. Challenge ID alone is insufficient; client-binding proof, authentication_version, user/purpose/expiry and attempt cap are mandatory.
- activateInvitation locks current invitation/membership/grants/root, verifies acceptance, email and current required MFA, rechecks inviter/delegation/role/organization state and installs only reserved same-tenant roles atomically. FIRST_ADMIN may activate ONBOARDING root, MEMBER requires ACTIVE root. Expired/revoked proof, suspended root or changed grant authority denies. No partial role activation on failure.
- Normal membership PATCH only deactivates. Re-entry creates a fresh invitation; inactive rows cannot regain access through role assignment. Reactivation reuses the unique org/user profile only after a fresh approved invitation/activation, with no inherited old grants.
- Refresh is one atomic ACTIVE→CONSUMED transition plus one new successor in same family/session/user. A consumed ancestor replay revokes the whole family and active successors, never returns a cached raw token. Password/email/factor change revokes all sessions and invalidates old authentication-version-bound proofs.
- Recovery tokens/codes consume once. Password reset never removes MFA, creates an active membership or logs the user in. Factor replacement preserves old factor until valid new confirmation; then retires old codes/factor and revokes sessions atomically.
- Identity success audit/delivery jobs commit with mutation. Denials append through a separate restricted writer after rollback. No proof material, hashes, seeds, cookies or request/response bodies in either audit stream.
- C-02 is approved at policy/contract level: only redeemCredentialHandoff releases sensitive material; generic metadata never implies delivery/MFA/activation. SESSION requires completed password/required MFA or authorized refresh; TOTP setup/replacement and recovery-code release have independent proof guards. Initial session remains PENDING_DELIVERY until redemption; expiry/replay/wrong purpose/client/version denies. All M01 email paths are controlled mock/synthetic only, never real outbound.

## Foundation security requirements

| ID | Candidate requirement | Planned tests |
| --- | --- | --- |
| SEC-ID-01 | No authority before accepted invitation/email/required MFA and atomic activation. | T-001, T-003, T-023, T-N01 |
| SEC-ID-02 | Purpose/user/binding/version-bound one-time challenges, no TOTP/code replay or tenant-switch bypass. | T-002, T-024, T-N02 |
| SEC-ID-03 | Refresh lineage rotation/reuse detection, absolute expiry and immediate session revocation. | T-002, T-024 |
| SEC-ID-04 | No generic secret response/redirect/audit/log echo; sensitive material only through dedicated approved one-time handoff, safe cookie/native modes and mock-only mail. | T-022, T-025, T-N03 |
| SEC-ID-05 | Tenant invitation/role composite FKs and RLS; narrow global proof resolver has no operational bypass. | T-003, T-004, T-023, T-N01 |
| SEC-ID-06 | Non-enumerating recovery, MFA preserved, no unsupported manual recovery/admin disable route. | T-002, T-024, T-025 |

These are declarative documentation constraints. Static fixture tests validate shapes/catalogue consistency only; only future application/database/device tests can establish actual enforcement.

The [handoff contract](../security/CREDENTIAL-HANDOFF.md) is the only sensitive-release boundary. credential_handoffs is restricted global storage; its encrypted envelope is erased on consumption/expiry, and request/header/material values never enter audit payloads. No pending or reset-only context can mint a SESSION handoff bypassing MFA. [Owner approval](../planning/STAKEHOLDER-APPROVAL-2026-11-07.md) is separate from validation. Production delivery remains unauthorized.
