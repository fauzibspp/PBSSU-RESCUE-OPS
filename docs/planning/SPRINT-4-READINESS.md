# Sprint 4 Readiness — Human Assignments and Movement Timeline

**Review date:** 2026-11-08
**Mode:** readiness review and contract freeze; implementation branch follows authorization gates
**Implementation authorization:** Owner authorized Sprint 4-A through 4-D conditionally on formal decision recording, exact scope reconciliation, and passing preflight. S4-P-01 duty semantics are resolved as optional/nullable; implementation must not begin until the recorded preflight gate passes.
**Verified base:** `origin/main` `4d64be934497a4d004a9d1860bb3220a07450fee`

## Recommendation

- **Planning: GO.** The roadmap, logical schema, authorization matrix, and OpenAPI identify the assignment and movement domains. The owner-approved S4-P package and optional/nullable duty contract are reconciled; preflight evidence determines scope freeze.
- **Implementation: GO within frozen scope.** Preflight passed and the exact inventory is frozen. The implementation branch must still be created from the verified latest `origin/main` before S4-A.

The Project Owner approved the three-table/four-existing-operation inventory and conditionally authorized implementation; preflight has passed and the manifest is frozen.

## Exact roadmap delta

The [approved implementation plan](IMPLEMENTATION-PLAN.md) identifies Sprint 4 as **human assignments and an append-only movement timeline**, dependent on Sprint 3 and primarily modules **M06 Dispatch/Assignment** and **M09 Vehicle Movement Logs**. Its listed acceptance references are **T-010 and T-011**, including cross-incident FK integrity and no external dispatch. Module IDs are not sprint numbers.

The approved Q-02 decisions constrain this slice:

- An incident may remain DRAFT or OPEN without an available vehicle; no automatic assignment or external notification is allowed.
- A dispatch prerequisite requires at least one eligible responder and one eligible AVAILABLE vehicle assigned to the same incident.
- DISPATCHED represents an authorized internal assignment, not an external dispatch message or acknowledgement.
- A vehicle must belong to the selected tenant and be AVAILABLE; MAINTENANCE and RETIRED vehicles are ineligible. One active incident assignment per vehicle must be enforced transactionally.
- Routine maintenance/retirement changes are rejected while a vehicle is actively assigned. Emergency breakdown, release, and reassignment are explicitly deferred by the 2026-11-08 S4-P-04 approval.
- Sprint 3 deferred DISPATCHED and assignment/arrival-dependent lifecycle transitions. Do not synthesize assignment, movement, dispatch, or arrival evidence.

The Project Owner subsequently approved the bounded package and authorized implementation conditionally. The current versioned manifest defines the exact candidate inventory; its frozen status is contingent on preflight validation.

## Delivered foundation and remaining delta

### Delivered on the verified main baseline

- M01 foundation plus Sprint 2 vehicle backend: tenant identity/RBAC, tenant transaction context and PostgreSQL RLS infrastructure; organization/member/vehicle APIs and the tenant-scoped `vehicles` table.
- Sprint 3-A/B/C/D incident foundation: `incidents`, `incident_locations`, `change_events`; all seven approved incident/location operations; lifecycle guards, location versioning, event/audit atomicity and redacted projections.
- Sprint 3-E tenant-only privileged MFA remediation: the shared RLS-safe privilege lookup and real HTTP failure-injection coverage are included through merged PR #3.
- Vehicle operations already delivered: `listVehicles`, `createVehicle`, `updateVehicle`. Incident operations already delivered: `listIncidents`, `createIncident`, `getIncident`, `updateIncident`, `transitionIncident`, `listLocations`, `createLocation`.

### Not delivered

- No `incident_personnel`, `incident_vehicles`, or `movement_logs` physical tables are present in the accepted migration chain (001–007); the current implementation baseline has 26 application tables.
- No assignment or movement API implementation exists.
- No assignment/movement permission rows or role grants are seeded in the implemented permission catalog. The approved scope requires only the four existing operation keys with exact G-04/G-06/G-07 grants; runtime grants are added in Sprint 4-A.
- Field Responder ASSIGNED-scoped incident/location reads remain fail closed until valid assignment evidence exists.
- Sprint 3 `transitionIncident` continues to reject assignment/arrival-dependent transitions as unavailable. Vehicle service-state changes are not yet coupled to active assignment records.

## Existing candidate contract and authorization references

The current OpenAPI document has 75 operation IDs. The owner-approved Sprint 4 inventory includes these four existing M06/M09 operations; no new operation ID is introduced:

| Module | Existing operation ID | Route | Existing permission key/group | Existing logical entity references |
| --- | --- | --- | --- | --- |
| M06 | `getAssignments` | `GET /incidents/{incidentId}/assignments` | `getAssignments`, G-04 | `incident_personnel`, `incident_vehicles` |
| M06 | `setAssignments` | `PUT /incidents/{incidentId}/assignments` | `setAssignments`, G-06 | `incidents`, `memberships`, `vehicles`, `incident_personnel`, `incident_vehicles` |
| M09 | `listMovements` | `GET /incidents/{incidentId}/movements` | `listMovements`, G-04 | `movement_logs` |
| M09 | `createMovement` | `POST /incidents/{incidentId}/movements` | `createMovement`, G-07 | `incident_vehicles`, `movement_logs` |

The current authorization model maps G-04 to explicit TENANT or ASSIGNED read scope. G-04 grants Organization Admin, Control Room Operator, Incident Commander, Read-Only Auditor (TENANT) and Field Responder (ASSIGNED). G-06 `setAssignments` grants Operator and Commander (TENANT). G-07 `createMovement` grants Operator and Commander (TENANT) and Field Responder (ASSIGNED). Platform Super Admin has no tenant operational grant. Seed only these existing permission keys and exact mappings.

Current request schemas describe `AssignmentInput` as `base_version`, up to 50 `membership_ids`, and up to 20 `vehicle_ids`; `setAssignments` replaces the active assignment set and releases removed records with history preserved. Frozen semantics define empty arrays as explicit pre-DISPATCHED release-all, identical sets as no-op, re-addition as a new interval, and stale versions as conflicts. `MovementInput` requires client UUID, assigned vehicle, event kind and UTC `occurred_at`; optional same-incident location, note and `supersedes_id` are preserved. `received_at` and actor membership are server-derived.

## Candidate schema and migration delta — PROPOSED

The approved logical schema and dictionary already list three unimplemented tenant entities:

1. `incident_personnel`: incident/membership assignment, optional nullable duty without default, assigned time, release time, and same-membership canonical user binding for the owner-approved global uniqueness rule.
2. `incident_vehicles`: incident/vehicle assignment, assigned time, release time.
3. `movement_logs`: assigned vehicle, optional incident location, movement kind, client occurrence time, server receipt time, actor membership, optional correction link and note.

These are the exact owner-approved Sprint 4 tables. Current physical inventory is 26 tables. Forward migrations 008 and 009 cover the four existing permission keys/grants and these three tenant tables; `change_events` is not extended. No historical migrations may be rewritten.

### Design constraints and known mismatches

- Tenant RLS and FORCE RLS, transaction-scoped tenant context, restricted runtime role, and tenant-composite FKs are required for every new tenant table.
- Vehicle eligibility and one-active-assignment uniqueness must hold across incidents under concurrent transactions, not only by application pre-check.
- Q-02 requires `setAssignments` to compare against `incidents.version` and increment once for a successful assignment-set change. Identical active sets are no-op and stale versions mutate nothing.
- Logical `incident_personnel` and `incident_vehicles` uniqueness is currently described as `(organization_id, incident_id, member/vehicle)`, while the assignment contract also releases removed records and preserves history. A release followed by reassignment to the same incident may conflict with that uniqueness. The owner/architectural contract must choose a partial active-row uniqueness design or another explicit history model.
- `AssignmentInput` intentionally does not carry `duty`; `PersonnelAssignment.duty` is optional/nullable and the database design has no default. Duty vocabulary/designation remain deferred.
- Sprint 3 `change_events` remains unchanged; Sprint 4 assignment history and movement timeline use their approved tables, with no new feed operation.
- `MovementInput` allows `supersedes_id`, while the `Movement` response omits correction lineage. Correction reason requirements and how a client can verify the corrected event chain are not fully specified.
- `setAssignments` empty arrays explicitly release all selected active assignments before DISPATCHED; post-DISPATCHED replacement/release is rejected.
- Existing `updateVehicle` must reject routine MAINTENANCE/RETIRED changes while an active assignment exists. This is an approved Q02-7 rule but adds a cross-module guard not present in Sprint 2; the precise Sprint 4 scope and transaction/lock interaction must be explicit.
- Existing `transitionIncident` currently returns `PREREQUISITE_UNAVAILABLE` for deferred states. Sprint 4 must state exactly which assignment/movement evidence changes that result; no synthetic evidence or automatic state transition is allowed.

## Proposed implementation slices — subject to owner scope freeze

1. **S4-0 Policy/contract closure:** owner decisions below; reconcile assignment and movement schemas with SRS/ERD/OpenAPI; approve exact migration/table/operation/permission manifest and test inventory.
2. **S4-A Tenant assignment data:** forward migration, RLS/FORCE RLS, tenant-composite FKs, active-member/vehicle eligibility, cross-incident uniqueness and `base_version` transaction semantics.
3. **S4-B Assignment API:** only the approved existing `getAssignments`/`setAssignments` contract; exact G-04/G-06 scopes; redacted projections and audit/change-event atomicity.
4. **S4-C Movement timeline:** only the approved existing `listMovements`/`createMovement` contract; exact G-04/G-07 scopes; append-only corrections and server receipt/actor provenance.
5. **S4-D Existing workflow integration:** conditionally enable only owner-approved `transitionIncident` edges using explicit assignment/movement evidence; guard `updateVehicle` service-state changes against active assignments.
6. **S4-E Acceptance:** full restricted-role RLS, HTTP auth/RBAC, race/failure-injection, cross-tenant, event/audit, lifecycle, vehicle-eligibility, regression, and scope checks.

The owner has approved the exact inventory and operational policy. Implementation is conditionally authorized after successful preflight and must stop on any newly discovered material ambiguity.

## Acceptance evidence required after separate implementation authorization

- Migration from fresh 001–007 and upgrade path; historical migration hashes unchanged; rollback/recovery behavior reported without bypassing M01-R01.
- Exact table/operation/permission inventory matches a signed Sprint 4 manifest.
- RLS/FORCE RLS and tenant composite FKs verified with the restricted runtime role; missing tenant context denied.
- Eligible active membership and AVAILABLE vehicle checks; MAINTENANCE/RETIRED vehicle rejection; one-active-vehicle assignment across concurrent different-incident writes yields one winner.
- Assignment replacement, release, history, idempotency/no-op, stale `base_version`, same-incident and cross-tenant references, and concurrent incident/vehicle service-state races tested.
- Movement is append-only; `occurred_at` is preserved as reported and `received_at` is server-derived; corrections append a superseding event; unsupported mutations are denied.
- Movement must be linked to a valid assignment; optional location must belong to the same tenant and incident; no external dispatch/agency acknowledgement is implied.
- Only explicit approved role/scope combinations can read or write; Field Responder access is limited to approved assignment evidence; platform-only, admin/auditor write, and cross-tenant negatives pass.
- `DISPATCHED`/`ON_SCENE` transitions remain denied unless the exact Q-02 prerequisites and approved evidence policy pass; no automatic transition, GPS fabrication, or external notification.
- Assignment/movement domain writes, audit records, and approved event/change-feed writes commit atomically and remain append-only/redacted.
- Update the seven Sprint 3 APIs' regression evidence, especially `transitionIncident`, `updateVehicle`, and tenant-protected reads; preserve permission and contract parity.

## Open gates

- **Owner policy:** S4-P-01 through S4-P-09 are APPROVED BY PROJECT OWNER on 2026-11-08; S4-P-01 duty is optional/nullable with no default and no request field. See [decision register](DECISION-REGISTER.md) and [contract reconciliation](SPRINT-4-CONTRACT-RECONCILIATION.md).
- **Recovery:** M01-R01 remains OPEN; no backup/restore or downgrade recovery is claimed here.
- **Retention:** Q-05 remains OPEN; no retention duration, offline horizon, or purge policy is inferred.
- **Deployment/operations:** Q-06 remains OPEN.
- **Client/device readiness:** Q-08 remains OPEN; this review does not add web/mobile scope.
- **Security:** production KMS/key rotation/recovery, production log/telemetry verification, and Auditor cancellation-reason retrieval remain open/deferred.
- **Sprint 4 implementation:** Authorized within the frozen scope. Post-DISPATCHED assignment intervals remain active pending a separately authorized future workflow; Sprint 4 implements no release or terminal transitions. Next step is the documentation freeze commit and isolated implementation branch.
