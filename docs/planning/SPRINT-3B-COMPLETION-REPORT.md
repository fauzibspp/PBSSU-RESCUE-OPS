# Sprint 3-B completion report

Status: **PASS for local development acceptance; not production-ready**
Branch: `feat/sprint-3-incident-backend`
Base commit: `275b73144b0e62c06bd55ab7d6badd4309d2e7a8`

## Delivered

- Added forward-only migration `005-incident-permissions` with exactly five keys and the approved role/scope mappings; aligned new organization onboarding with those mappings.
- Added forward-only migration `006-protected-cancellation-audit` to preserve `{}` metadata while permitting only the exact encrypted cancellation envelope on the approved transition audit action.
- Implemented exactly five operations: `listIncidents`, `createIncident`, `getIncident`, `updateIncident`, and `transitionIncident`.
- Added tenant transactions using the restricted runtime database role, exact permission checks, privileged-role MFA enforcement, RLS-backed queries, CAS version updates, atomic event/audit writes and safe error envelopes.
- Added an incident controller/service, ciphertext helper, restricted-role integration coverage, fresh migration harness, scope check, and validation/completion documents.
- Added no tables, permissions beyond the five named keys, OpenAPI operations, or historical migration edits. Location APIs, assignments, dispatch, movement, GPS/media, offline sync, reports and client UI remain excluded.

## Lifecycle behavior

| Transition | Outcome |
| --- | --- |
| DRAFT → OPEN | Operator or Commander; CAS/versioned event and audit |
| DRAFT → CANCELLED | Commander only; nonempty reason, encrypted audit envelope |
| OPEN → CANCELLED | Commander only; nonempty reason, encrypted audit envelope |
| Operator cancellation | Denied |
| OPEN → DISPATCHED | `PREREQUISITE_UNAVAILABLE` until Sprint 4 assignment evidence |
| DRAFT → DISPATCHED | `INVALID_TRANSITION` |
| Other unsupported transitions | `INVALID_TRANSITION` unless the approved edge specifically lacks Sprint 4 assignment/movement evidence |
| Stale base version | `STALE_VERSION` with current version; no mutation |

`updateIncident` permits only the contract’s allowlisted descriptive title field and cannot change status. Generic incident list/get never decrypts cancellation metadata. The reason field in the contract remains optional; retrieval is deferred.

## Validation evidence

Final evidence is recorded in [SPRINT-3B-API-VALIDATION.md](../testing/SPRINT-3B-API-VALIDATION.md): 16 unit/contract tests, 22 restricted-role integration/regression tests, fresh 26-table migration chain with 48 permission keys, onboarding/catalog grant parity, concurrency, ciphertext-only audit, rollback on key-load failure, formatting/lint/typecheck/build and scope checks all passed. Initial failures and their corrections are documented there. No production recovery, KMS, deployment, or live-user property is claimed.

## Remaining gates

- M01-R01 migration recovery remains OPEN; no downgrade or backup/restore claim.
- Q-05 retention/disposal, Q-06 deployment/recovery ownership and Q-08 client readiness remain OPEN.
- Local key management is file/ACL based for synthetic development only. Production KMS, rotation and recovery are not provided.
- Stored cancellation-reason retrieval is deferred; the Auditor-specific view is also deferred.
- ASSIGNED incident reads fail closed until Sprint 4 assignment evidence is available.

**Recommendation:** Sprint 3-B implementation gates pass for owner review. Sprint 3-C may proceed only under separate authorization and should preserve the same tenant, audit and encryption limits.
