# UF-01 Existing API Response Contract Reconciliation

**Authorization:** Project Owner, `UF-01 CONTRACT RECOVERY AND AUTONOMOUS EXECUTION RESUME`, 2026-11-08.
**Scope:** Existing response schemas and HTTP status alignment only. No operation, permission, role, database entity, request schema, or operational workflow was added.

## MFA enrollment

| Field             | Previous OpenAPI                                          | Observed service / HTTP response                                                                                      | Reconciled contract                                                               |
| ----------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `enrollment_id`   | Required                                                  | UUID                                                                                                                  | Required UUID                                                                     |
| Challenge state   | Required `challenge` plus unrelated state/delivery fields | Challenge is established by the prior `login` response; enrollment returns `authentication_state: CHALLENGE_REQUIRED` | Required constant `CHALLENGE_REQUIRED`                                            |
| Setup handoff     | `setup_handoff`                                           | `handoff: { handoff_id, purpose: TOTP_SETUP, expires_at }`                                                            | Required purpose-bound `handoff` descriptor                                       |
| Secret / URI / QR | Not in metadata schema                                    | Not returned by `startMfaEnrollment`; released only by one-time dedicated handoff redemption                          | Forbidden in generic enrollment response; unchanged dedicated redemption contract |
| Expiration        | Top-level `expires_at`                                    | Expiry is on the handoff descriptor                                                                                   | Documented only on `handoff.expires_at`                                           |

The service implementation is supported by `mfa.integration.test.ts`: enrollment
requires a password-verified `MFA_ENROLL` or `FACTOR_REPLACE` challenge and
client binding; the generated seed is encrypted in storage; a five-minute
handoff is bound to user, challenge, client kind, binding, and authentication
version. The handoff is one-time and purpose-checked. Confirmation verifies a
fresh TOTP against the same user and challenge, consumes the challenge, and
does not return the seed. The actual HTTP test now exercises privileged
tenant-only login, enrollment, one-time setup redemption, and confirmation.
Secret material is handled only in memory in the test; it is not logged or
written to reports/artifacts.

The same previous `MfaEnrollment` schema was incorrectly reused for
`startMfaReplacement`, whose service response combines challenge metadata with
the enrollment result. A separate closed `MfaReplacement` schema now describes
that existing operation without altering its request or behavior.

## Self-membership projection

The shared administrative `Membership` and `MembershipPage` schemas remain
unchanged for organization administration operations. `GET /me/memberships`
now references dedicated `MyMembershipPage` / `MyMembership` schemas matching
the actual self-service projection:

- `membership_id`, `organization_id`, `organization_name`, `organization_slug`,
  `organization_status`, `display_name`, membership `status`, `availability`,
  and `roles`.
- Each role summary contains `code` and `name`; role codes use the existing
  role-code syntax enforced by `createRole` (`^[A-Z0-9_-]{1,64}$`).
- The five Q-01 tenant template codes are the only role codes the UI may map to
  navigation affordances. Custom role codes may be returned and are displayed
  without operational navigation. Neither codes nor names authorize requests.
- Memberships are filtered by the authenticated canonical user. The projection
  contains no private contact field, user ID, role grants, or permission list.

Q-01's five tenant role templates and explicit permission grants remain the
authority. Platform Super Admin is a platform grant, not an organization
membership role, and still receives no implicit tenant-content access.

## HTTP status alignment

The approved OpenAPI response codes are now implemented for existing
authentication operations used by the web flow: login/refresh/MFA verify and
confirmation return 200; enrollment/factor replacement return 202. The NestJS
POST default had returned 201. This narrow correction restores the already
approved HTTP contract and does not change authentication state transitions.
These responses also carry the already documented `Cache-Control: no-store` and
`Pragma: no-cache` headers. Credential handoff redemption retains its explicit
200/204 behavior and dedicated content type.

## Compatibility and validation

- No new operation IDs: OpenAPI remains 75 operations.
- No new permission keys, roles, database entities, or migration.
- Administrative `Membership` schemas are unchanged; self-service membership
  clients must consume the existing actual `membership_id`/`roles` projection.
- Generic MFA consumers must consume the metadata-only `handoff` descriptor;
  setup material still requires the dedicated purpose-bound redemption.
- Contract tests compile all OpenAPI component schemas and test positive and
  negative payloads. A real Nest HTTP integration test validates actual
  membership and enrollment responses against those schemas.
- The full guarded integration suite passed 43 tests across six files after
  the response status and no-store corrections. This is local synthetic test
  evidence, not production security or KMS evidence.
