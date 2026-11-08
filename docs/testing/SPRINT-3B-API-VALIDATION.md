# Sprint 3-B API and audit validation

Date: 2026-11-07
Branch: `feat/sprint-3-incident-backend`
Base: Sprint 3-A commit `275b73144b0e62c06bd55ab7d6badd4309d2e7a8`

## Scope and database

Implemented exactly five API operation IDs: `listIncidents`, `createIncident`, `getIncident`, `updateIncident`, and `transitionIncident`. The frozen OpenAPI remains unchanged at 75 logical operations. Sprint 3 still owns exactly three incident tables (`incidents`, `incident_locations`, `change_events`); Sprint 3-B added no table. Migration 005 adds exactly five permissions. Migration 006 changes only the audit metadata constraint. Migrations 001-004 were not edited.

The fresh isolated database was `pbssu_m01_sprint3b2_53392f8c4888` using the pinned local PostGIS image. Actual migration command: `npm run db:migrate:sprint3b2`. Result: **PASS** — 26 application tables, 48 permission keys, migrations 001-006 in order, PostgreSQL 18.6, PostGIS 3.7.0, and RLS/FORCE RLS on all three incident tables. Restricted runtime grants deny event UPDATE/DELETE and deny audit UPDATE/DELETE.

The first migration attempt exposed an unsupported JSONB function and a PostgreSQL regex repetition limit. The migration was corrected to compare exact JSON object keys and use PostgreSQL-compatible ciphertext delimiter/length checks. A later migration grant test exposed and corrected a comparison against permission keys instead of allowed resource scopes. These failed attempts were not counted as passing evidence; the final checks below were run after fixes.

## Permission and role matrix

| Permission | Approved grant | Scope | MFA behavior |
| --- | --- | --- | --- |
| `listIncidents`, `getIncident` | Organization Admin, Control Room Operator, Incident Commander, Read-Only Auditor | `TENANT` | Enforced for privileged role templates |
| `listIncidents`, `getIncident` | Field Responder | `ASSIGNED` | No privileged-MFA requirement from this grant |
| `createIncident`, `updateIncident` | Control Room Operator, Incident Commander | `TENANT` | Required |
| `transitionIncident` | Control Room Operator, Incident Commander | `TENANT` | Required; cancellation target additionally requires Commander |

Organization Admin receives no incident write or transition grant. Platform Super Admin receives no tenant operational grant. First-admin onboarding seeds the same exact mappings. Responder list access returns no records and get access fails closed while assignment evidence is absent; Sprint 4 assignment infrastructure is not implemented.

## Encryption and audit controls

The existing local crypto facility was verified to use AES-256-GCM, a random 12-byte nonce, a 16-byte authentication tag, a 32-byte key and a 24-character key identifier. AAD binds ciphertext to organization, incident and actor IDs. No decrypt path is called by list/get or `listAuditLogs`.

The development key file is `%LOCALAPPDATA%\PBSSU-RESCUE-OPS\sprint3b-identity-keys.json`, outside the repository and database. A metadata-only verifier confirmed key length, key-id format and matching Ed25519 access-key pair without printing values. Windows ACL evidence: read-only for `FAUZI-MSI\CodexSandboxOffline`; full control for the user, SYSTEM and local Administrators. This is a local synthetic-test key set, not production KMS, backup, rotation or recovery management.

Migration 006 preserves `{}` for ordinary audit actions and permits only a single exact `cancellation_reason` envelope for successful `transitionIncident`/`INCIDENT` records. Audit metadata is not returned by API projections. Plaintext reason is not stored in `incidents`, `change_events`, or audit metadata. Event and audit rows remain append-only under runtime privileges and triggers. Encryption-key-load failure rolls back incident status/version, event and audit writes.

The API does not decrypt or return stored cancellation reasons in generic list/get operations. Authorized retrieval remains deferred, including the separately required Auditor view. This is recorded as a contract/projection dependency; no API operation or permission was added.

## Verification matrix

| Gate | Command / evidence | Result |
| --- | --- | --- |
| Fresh migrations and inventory | `npm run db:migrate:sprint3b2` | PASS: 26 tables, 48 permission keys, 001-006 |
| Audit/role migration against synthetic existing role templates | Restricted-role `database.integration.test.ts`, reruns migration 005 idempotently in a transaction | PASS: exact 16 role grants across Commander, Operator, Responder, Auditor and Admin fixtures; no platform role |
| First-admin role seeding | `mfa.integration.test.ts` exact 16-row assertion | PASS |
| Incident operations and tenant RBAC | `incident.integration.test.ts` | PASS: CRUD, status, denied nonmember/platform capability, Operator cancellation denial |
| Lifecycle and conflict behavior | `incident.integration.test.ts` | PASS: DRAFT→OPEN, Commander cancellation, stale version, invalid DRAFT→DISPATCHED, unavailable OPEN→DISPATCHED |
| Concurrency | Two simultaneous `base_version=1` updates | PASS: one winner, one `STALE_VERSION`, final version 2 |
| Audit/encryption atomicity | Child-process key-load failure; ciphertext persistence and metadata constraint tests | PASS: failed encryption leaves DRAFT/version/events/audit unchanged; no plaintext found |
| Cross-tenant/RLS/composite FKs/pool reuse | Existing restricted-runtime database integration suite | PASS |
| OpenAPI contract | Existing contract tests and `npm run scope:sprint3b` | PASS: frozen 75 operations unchanged; five controller operations; no table/API expansion |
| Unit/contract tests | `npm test` | PASS: 16 tests (2 files) on final source tree |
| Integration/regression tests | `npm run test:integration` with `.cache/sprint3b2/database.json` and LocalAppData test key | PASS: 22 tests across 4 files on final source tree |
| Format, lint, typecheck, build | `npm run format:check`; `npm run lint`; `npm run typecheck`; `npm run build` | PASS on final source tree |
| Diff whitespace | `git diff --check` | PASS |

## Limitations and risks

- Runtime tests use a stubbed identity authenticator for incident service authorization; existing M01/MFA integration tests separately exercise real local token/session behavior. Full HTTP-level incident authentication tests remain a follow-up.
- Cancellation reason retrieval is not implemented; Auditor reason access remains deferred.
- The local file key uses OS ACL protection only and has no managed rotation, KMS, backup, or production recovery lifecycle.
- Field Responder `ASSIGNED` filtering cannot return assigned incidents until Sprint 4 assignment evidence exists; it fails closed.
- M01-R01 migration recovery remains OPEN. No down/backup-restore recovery was tested or claimed.
- Q-05 retention/disposal, Q-06 deployment/recovery ownership and Q-08 web/mobile readiness remain OPEN.
- One initial failed disposable migration database and one retry container with no saved state remain isolated under Sprint 3-B labels; neither was reused for final passing evidence. No unrelated Docker resource was modified or removed.
