# Foundation decisions, approvals and remaining gates

PBSSU-REG-001 v0.5, 2026-11-07 (updated for M02 readiness review). Current approval authority is the [explicit project-owner record](STAKEHOLDER-APPROVAL-2026-11-07.md), separate from technical validation. Prior pending statuses in historical validation records describe their original dates only.

| Decision | Current status | Scope and remaining verification |
| --- | --- | --- |
| Q-01 | APPROVED 2026-11-07 | Tenant DENY defaults, six roles, exact scoped keys/delegation, no automatic platform operational access. Approved current contract has 75 keys (47 tenant/two platform/26 identity/handoff); added handoff capability is non-tenant, proof-bound only. |
| Q-03 | APPROVED POLICY 2026-11-07 | Local email/password/Argon2id, privileged TOTP MFA, rotation/revocation, guarded invitation activation and separate account/MFA recovery. Runtime hash/parameter/security behavior still needs tests; all-factor recovery custody not automatically operational. |
| Q-04 | APPROVED IMPLEMENTATION BASELINE 2026-11-07 | Node24/Nest12/PostgreSQL18/PostGIS3.7/Kysely+pg/explicit SQL/npm workspaces. Exact pins/peers/digests/native/runtime compatibility remain unverified gates. Web/mobile exact choices are not silently approved. |
| C-01 | ALIGNED APPROVED LOGICAL CONTRACT | OpenAPI 0.4.1, 40-entity logical schema/dictionary/FK model, eight identity lifecycle catalogues and exact permission/requirements/test mapping. Sprint 3 adds a frozen 3-table/7-operation contract only; not runtime enforcement evidence. |
| C-02 | RESOLVED_POLICY_CONTRACT 2026-11-07 | [Explicit one-time handoff](../security/CREDENTIAL-HANDOFF.md): no generic secret responses/log/audit disclosure, all required proof/MFA retained. Approved future email invitation channel; M01 mock/synthetic only, no outbound or production secret delivery. |

## Operational/implementation gates, separate from approval

| Gate | Required evidence / authorization |
| --- | --- |
| G-DELIVERY-DEV | Implement controlled mock-only mail, synthetic recipients, private authorized local test mailbox and proof-bound handoff. No adapter exists/tested yet. No logging/public exposure of synthetic links. |
| G-DELIVERY-PROD | Future provider/sender/domain/transport/key custody/retention and explicit real delivery authorization. NOT AUTHORIZED by baseline approval. |
| G-RECOVERY-OPS | Account reset must preserve MFA. All-factor recovery requires independent custodians/evidence/cooling controls; keep unavailable until operationally approved. |
| G-RUNTIME | Resolve/pin exact reviewed packages/image digest; execute native Argon2, migration/RLS/composite-FK/pool/concurrency/CSRF/projection tests. No result supplied by approval. |
| G-M01 | Explicit authorization to start the [proposed backend scope](M01-READINESS.md). This turn permits baseline documentation/validation/local commit only. |
| G-WEB-MOBILE | Later exact frontend/Flutter/encrypted-SQLite/device/build/license choices and checks; not forced into backend-only M01. |

## Decisions and questions retained at their feature/pilot gates

| ID | Unresolved question / proposed owner | Blocks |
| --- | --- | --- |
| Q-02 | APPROVED BY PROJECT OWNER 2026-11-07 | Policies Q02-1 through Q02-9 and Sprint 3 inventory of exactly 3 new tables / 7 operations. Full approval is recorded below and in [Q-02 proposal](Q-02-DECISION-PROPOSAL.md). This approves policy and contract freeze only; Sprint 3 implementation remains unauthorized. Sprint 4 assignment/movement and emergency release dependencies are explicitly deferred. |
| Q-05 | OPEN — retention periods, lawful disposal, anonymization, legal holds, device offline horizon, lost-device response and report sensitivity require owner/privacy approval. No indefinite-retention approval is implied. | Sync expiry, exports and any production-like use. |
| Q-06 | Hosting/data location, approved budget, daily backup owner, RPO/RTO, availability/support and load profile? Operations/infrastructure owner. | Service commitments and deployment. |
| Q-07 | Report numbering format and local-year rule, required report template, sign-off authority, allowed export recipients? Operations lead. | Report implementation/UAT. |
| Q-08 | Actual team capacity, Android/iOS minimum OS, macOS build access and device test inventory? Delivery lead. | Reliable schedule and iOS build verification. |
| Q-09 | Victim-data minimum fields and field encryption/key custody, approved access procedure? Data owner/security. | Victim data implementation/pilot. |
| Q-10 | Agency directory ownership and evidence needed for any manual acknowledgement? Operations lead. | Agency evidence UI; no official integration assumed. |

## Q-02 operational policy approval record

**Decision:** APPROVED BY PROJECT OWNER
**Authority:** Project Owner
**Date:** 2026-11-07
**Implementation status:** NOT AUTHORIZED. Approval covers the operational policy and documentation/contract freeze only.

1. **Q02-1 — Lifecycle:** Approve DRAFT → OPEN → DISPATCHED → ON_SCENE → MONITORING → RETURNING → COMPLETED → CLOSED and ON_SCENE → RETURNING. Defer DISPATCHED and assignment/arrival-dependent transitions until Sprint 4 evidence exists. Reject unsupported transitions; never synthesize dispatch/arrival evidence.
2. **Q02-2 — Cancellation:** CANCELLED is allowed only from DRAFT or OPEN, with mandatory reason and Incident Commander authorization. Post-dispatch cancellation awaits a future authorized resource-release workflow. Generic incident updates cannot change status.
3. **Q02-3 — Completion/closure/reopen:** COMPLETED requires nonempty outcome; CLOSED requires Incident Commander review. CLOSED and CANCELLED cannot be reopened in MVP. Report approval/versioning remains separate.
4. **Q02-4 — Dispatch prerequisites:** Require at least one eligible responder and one eligible AVAILABLE vehicle assigned to the same incident. DISPATCHED records an authorized internal assignment only; it does not represent external message delivery or acknowledgement. Assignment/dispatch implementation remains Sprint 4.
5. **Q02-5 — No vehicle:** Incidents may be DRAFT or OPEN without an available vehicle. Show unmet prerequisites without representing dispatch. No automatic assignment or external notification.
6. **Q02-6 — Vehicle eligibility:** One active incident assignment per vehicle; vehicle must belong to the selected tenant and be AVAILABLE. MAINTENANCE and RETIRED vehicles are ineligible. Sprint 4 must enforce eligibility and uniqueness transactionally.
7. **Q02-7 — Maintenance/breakdown:** Reject routine maintenance/retirement changes while assigned. Define a separate emergency breakdown/release/reassignment workflow before Sprint 4. No silent cancellation, release or replacement selection; no assignment dependency is added to Sprint 3.
8. **Q02-8 — Authority:** Preserve Q-01 exact grants. Commander controls cancellation/closure; Operator performs authorized ordinary transitions only. No implicit incident operational grants to responder, organization admin, auditor or platform admin. No mandatory distinct-person maker/checker for MVP. Keep explicit authorization, assurance, reason and audit controls.
9. **Q02-9 — Concurrency/audit:** Lifecycle commands and incident updates require `base_version` and atomic compare-and-swap. Every successful transition increments incident version once and appends change event and audit atomically. Stale versions return stable conflict without mutation. Change events are append-only. Location creation carries parent incident `base_version` and increments incident version atomically. Event/location reads remain tenant-authorized and redacted.

10. **Decision A — Cancellation reason visibility (APPROVED BY PROJECT OWNER, 2026-11-07):** Cancellation reason is restricted operational information. Incident Commanders and Control Room Operators may access its full value for authorized tenant incidents, subject to tenant/permission checks. Field Responders receive CANCELLED status and only minimum operational information. Organization Admins and Platform Super Admins receive no automatic reason access. Read-Only Auditors may see the full reason only through a specifically authorized audit view. The current `listAuditLogs` contract returns a redacted audit record without metadata and therefore does not yet provide that view; no new endpoint, schema field, permission or role grant is added by this approval. Auditor reason access is deferred until separately specified within an authorized contract change. Reasons are excluded from generic logs, public telemetry, unauthorized notifications and unredacted errors.
11. **Decision B — Append-only and purge (APPROVED BY PROJECT OWNER, 2026-11-07):** Change events and audit records are append-only through ordinary operational APIs; corrections use new authorized events. Sprint 3 adds no automatic purge or retention scheduler. This is not approval for indefinite personal-information retention. Q-05 remains OPEN; future deletion, anonymization, legal retention or archival requires a separately approved policy and implementation.

**Sprint 3 contract freeze:** exactly three new tables (`incidents`, `incident_locations`, `change_events`) and seven operations (`listIncidents`, `createIncident`, `getIncident`, `updateIncident`, `transitionIncident`, `listLocations`, `createLocation`). Sprint 4 assignments, movement, breakdown/release behavior and any external dispatch remain deferred. See [scope manifest](SPRINT-3-SCOPE.v1.json) and [contract validation](../testing/SPRINT-3-CONTRACT-FREEZE-VALIDATION.md).

**M01-R01:** remains OPEN. Q-02 approval does not approve rollback, backup/restore, production deployment or recovery.

## Sprint 3-B bounded implementation decisions (2026-11-07)

The Project Owner authorized the exact incident permission recovery and one forward-only audit metadata compatibility migration for Sprint 3-B. Migration `005-incident-permissions` adds only `listIncidents`, `getIncident`, `createIncident`, `updateIncident`, and `transitionIncident`. G-04 read grants are Tenant-scoped for Organization Admin, Control Room Operator, Incident Commander and Read-Only Auditor, and ASSIGNED-scoped for Field Responder. G-05 create/update grants go only to Control Room Operator and Incident Commander. `transitionIncident` is granted only to Operator and Commander; command target checks reserve cancellation for Commander. No platform operational grants and no Organization Admin write/transition grants are introduced. New-organization onboarding seeds the same mappings. Platform Super Admin's separate platform grant does not satisfy tenant membership/permission checks.

Migration `006-protected-cancellation-audit` replaces only the historical empty-object metadata constraint with an allowlist for `{}` or a single exact, versioned AES-256-GCM ciphertext envelope on successful `transitionIncident` audit records for `INCIDENT`. It preserves tenant RLS/FORCE RLS, runtime insert-only audit access, and immutable audit triggers. Historical migrations 001-004 remain unchanged; both new migrations are forward-only. No table or API operation was added.

The key file at `%LOCALAPPDATA%\PBSSU-RESCUE-OPS\sprint3b-identity-keys.json` is a random local development key set generated for synthetic testing, outside the repository/database. Format and key-pair consistency were checked without displaying key contents. Its ACL grants read-only to the dedicated local test account and full control to the owner, SYSTEM and local Administrators. This file-based arrangement is local-only and is not production KMS/key lifecycle management. No production key, real operational data, or credential issuance is authorized.

Cancellation reasons are never stored in plaintext in incidents, change events, or audit metadata and are not decrypted by generic list/get operations. The current API does not return the stored reason; authorized retrieval, including the deferred Auditor view, remains a follow-up contract/design dependency. Reasons remain absent from generic logs, telemetry, unauthorized notifications, and error responses. M01-R01, Q-05, Q-06, and Q-08 remain OPEN.

## Sprint 3-C local implementation record (2026-11-08)

Under separate Project Owner authorization, Sprint 3-C implements only the remaining frozen operations `listLocations` and `createLocation`. Forward-only migration `007-location-permissions` adds those two approved operation permission keys and exact G-04/G-05 role-scope grants; no new table, API operation, or permission beyond the frozen seven-operation Sprint 3 inventory was introduced. Creation requires parent `base_version`, atomically increments it once, writes an immutable logical-version-1 location, LOCATION_CREATED event, and redacted audit record. Responder ASSIGNED reads remain fail closed without Sprint 4 assignment evidence. See [Sprint 3-C validation](../testing/SPRINT-3C-LOCATION-VALIDATION.md) and [completion report](SPRINT-3C-COMPLETION-REPORT.md) for actual test evidence and limitations.

## Sprint 3-D point/accuracy contract clarification (2026-11-08)

**Decision:** Project Owner approved preservation of the existing database invariant `(point IS NULL) = (accuracy_m IS NULL)` and authorized a narrowly scoped OpenAPI clarification. `LocationInput` now requires `point.accuracy_m` whenever `point` is supplied. Both fields may be absent. Explicit null remains invalid, and no accuracy value is synthesized. The shared `Point` schema and its use by future observation contracts remain unchanged; response schemas and the seven-operation Sprint 3 scope are unchanged. No migration or database constraint change is authorized or required. See the Sprint 3-D final acceptance record for executed schema and HTTP validation evidence.

## M01 implementation risk

| ID | Status | Finding / recommendation | Acceptance gate |
| --- | --- | --- | --- |
| M01-R01 | OPEN — production-like recovery gate | M01-F applied migrations 001/002 on a fresh isolated database, then the existing guarded `down` refused because migration 002 seeds permission rows and the guard requires all app tables empty. Sprint 2 uses forward migration 003 and does not claim downgrade/recovery verification. No migration history, data or rollback guard was altered. Recommend forward-only migrations for persistent environments, immutable migration history, corrective forward migrations, and verified backup/restore to a separate target. Do not manually delete seed/audit rows or bypass the guard. | Test repeated up/no-op, migration failure atomicity/detectability, seed/grant preservation, unchanged state on guarded rollback refusal, and isolated backup/restore including RLS/FORCE RLS/composite constraints and runtime tenant isolation. Full details and any future reversible-migration acceptance tests are in [M02 readiness](M02-READINESS.md). |

## Assumptions and risks retained

A-01 global login/tenant-local profiles is accepted in the foundation. A-02 report family/local-year rule, A-03 offline write scope, A-04 no sharing/impersonation, A-05 minimized export and A-06 staffing/schedule remain documented working assumptions for their feature gates; this approval grants no sharing or dispatch authority.

R-01 tenant-context/pool leakage, R-02 lost device/token, R-03 sync conflicts, R-04 media/export leakage, R-05 mistaken agency response, R-06 recovery/capacity and R-07 privacy policy remain runtime/operational risks. C-02 policy resolution does not remove implementation disclosure/replay/CSRF/mail risks. Use purpose/version/client-bound one-time release, explicit generic-response allowlists, mock-only startup/recipient checks and redacted dual audit streams; prove them before use.

No exact version/digest or test result is approved. Blueprint safety constraints remain. No real identities/contacts/banking data, production sends, deployment or M01 implementation is authorized by the baseline commit.
