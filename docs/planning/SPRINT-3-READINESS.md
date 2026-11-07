# Sprint 3 Readiness and Scope Review

**Review date:** 2026-11-07  
**Accepted baselines:** M01 `fe5cbec0d2947bc0b8c0f87856e4f7e4f4fbf5b7`; Sprint 2 `bfeb7c381bc06038aa75a3bd8863068cbfee1931`  
**Reviewed branch:** `feat/sprint-2-vehicle-backend`  
**Mode:** Documentation-only. This review does not authorize implementation or deployment.

**Approval update (2026-11-07):** The Project Owner has approved Q02-1 through Q02-9, the exact three-table/seven-operation Sprint 3 contract inventory, and final decisions on cancellation-reason visibility and append-only/no-purge handling. This approves documentation and contract freeze only. Sprint 3 implementation remains **NOT AUTHORIZED**. The [scope manifest](SPRINT-3-SCOPE.v1.json) is authoritative for the frozen inventory.

## Recommendation

- **Planning/contract freeze: GO.** Q-02 and the exact inventory are approved and aligned in the planning/contract documents.
- **Implementation: NOT AUTHORIZED.** Owner approval explicitly covers documentation/contract freeze only. Separate implementation authorization is required. Sprint 4 evidence remains a hard gate for deferred transitions.

## Exact roadmap scope

`docs/planning/IMPLEMENTATION-PLAN.md` names Sprint 3 as **“Incident lifecycle, multiple locations and change-event foundation; M05”**, dependent on Sprint 2 and Q-02. That is the exact planned increment. Blueprint module M05 is Incident Management; blueprint module labels are not delivery milestones.

The next roadmap rows set the boundary: Sprint 4 implements human assignments and append-only vehicle movement (M06/M09); Sprint 5 implements location observations/risk, optional GPS, and private media (M07/M08). Offline synchronization, reports, dashboards and hardening are later sprints. They must not be inferred as Sprint 3 scope.

The plan did not previously enumerate a table or operation count. The Project Owner has now approved the following exact bounded inventory for contract freeze:

| Frozen Sprint 3 surface | Approved inventory | Boundary |
| --- | --- | --- |
| Incident operations | `listIncidents`, `createIncident`, `getIncident`, `updateIncident`, `transitionIncident` | Frozen. Tenant-scoped CRUD/commands; status is command-only. |
| Incident locations | `listLocations`, `createLocation` | Frozen. M07-owned subresource included in Sprint 3; create uses parent `base_version`. No observations, live GPS, or responder tracking. |
| New logical tables | `incidents`, `incident_locations`, `change_events` | Exactly three additions. Reuse M01 `organizations`, `memberships`, RBAC, `audit_logs`; reuse Sprint 2 `vehicles`. |
| Change-event foundation | Append-only tenant event/change records emitted atomically with incident and location mutations | Frozen internal event foundation; no `pushSync`, `pullSync`, offline queue, client cursor, or general event API in Sprint 3. Event reads have no standalone operation and follow parent entity authorization/redaction. |

The seven approved operations already exist in OpenAPI 3.1 and traceability, but are not implemented by the accepted M01/Sprint 2 baselines. Contract presence and Q-02 approval are not implementation authorization. The frozen contract is OpenAPI 0.4.1; no operations were added.

## Delivered capabilities and remaining delta

### Reusable M01 foundation

- NestJS modular monolith, REST/OpenAPI contract tests, configuration and DTO validation patterns.
- Verified identity/session/MFA lifecycle, selected organization context, active membership lookup, explicit permission catalogue/RBAC, and deny-by-default authorization.
- Kysely/pg transaction discipline, transaction-local tenant context, restricted runtime role, RLS/FORCE RLS, audit writes and versioned mutation patterns.
- Organizations, memberships/personnel, settings, permission catalogue, audit/security records and synthetic integration-test support.
- M01 completion/validation records report 22 foundation tables and 40 implemented operations. M01-R01 remains unresolved; no production-like backup/restore evidence is claimed.

### Reusable Sprint 2 capabilities

- Tenant vehicle registry, service states `AVAILABLE`, `MAINTENANCE`, `RETIRED`, optimistic versioning, G-10/G-16 permissions and minimized vehicle projections.
- Current test and migration infrastructure, with the accepted additive Sprint 2 commit above.
- Sprint 2 has no incidents, incident locations, active assignment records, dispatch workflow or movement log.

### Frozen Sprint 3 implementation delta (not authorized to start)

- Add incident and incident-location storage with tenant-composite constraints, RLS/FORCE RLS, indexes, and audited/transactional writes.
- Add all five approved incident operations and two location operations, reusing exact existing permission grants, with event/change recording and OpenAPI/controller mapping.
- Implement only the Q-02-approved lifecycle/authorization rules that are independent of Sprint 4 assignments. Define explicit deferred behavior for any transition whose guard requires assignments or arrival evidence.
- Add tenant, role, lifecycle, state-version, location-parent, concurrency and event-atomicity tests.

## Readiness gaps and architecture dependencies

1. **Transition/assignment sequencing:** resolved by Q02-1/4: only DRAFT→OPEN and cancellation from DRAFT/OPEN are supported in Sprint 3. DISPATCHED and other assignment/arrival-dependent transitions return `409 PREREQUISITE_UNAVAILABLE` until Sprint 4 provides verified evidence. No placeholder assignments or dispatch claims.
2. **No-vehicle case:** resolved by Q02-5: DRAFT/OPEN is allowed, with unmet prerequisite shown; no assignment, dispatch, or external notification is synthesized.
3. **Location version/idempotency:** resolved by Q02-9: `LocationInput.base_version` is required; successful creation increments the parent incident version exactly once and atomically writes its event and audit record.
4. **Change-event contract:** Sprint 3 creates only append-only incident/incident-location event metadata. No cursor, pull/sync, or standalone event API. Q-05 retention policy remains later; no event purge is implemented or implied.
5. **Lifecycle authorization:** Q-02 and the approved Q-01 role matrix are aligned in SRS, OpenAPI, authorization design and traceability. Runtime enforcement remains unimplemented.
6. **Report coupling:** completion remains separate from report approval per blueprint/ADR-006. Report snapshots, submit/review and export remain Sprint 7.
7. **Module/milestone labeling:** location API ownership remains M07; its incident subresource is explicitly included in the Sprint 3 M05 delivery slice and cross-traced to M05/M07/M13.

## Security, recovery and release gates

- Preserve Q-01 exact operation grants and six-role model. No platform status or organization-admin status grants operational incident rights by implication.
- Every read/write must resolve the active organization and membership and use tenant-scoped transactions, composite foreign keys and RLS/FORCE RLS. Incident/location IDs from another tenant or incident must not disclose existence or mutate state.
- Require allowlisted DTOs; never accept tenant, actor, status changes through generic PATCH, assignment facts, or approval identity from client-controlled fields.
- Keep commands online-only, version-checked and audited. Incident state, audit record and event/change record must be atomic; append-only events must not contain private victim/contact fields or secret material.
- **M01-R01 stays OPEN.** No Sprint 3 work closes the production-like migration recovery gate. Use additive forward migrations; do not bypass the existing rollback guard. A separate-target backup/restore drill must verify schema, permission seeds, RLS/FORCE RLS, composite constraints and runtime tenant isolation before production-like use.
- Q-06 hosting, data location, backup owner, RPO/RTO, support and availability remain deployment gates. Local Sprint 3 acceptance would not authorize deployment or pilot data.
- Q-09 victim-data approval remains required before adding victim fields or access. The frozen Sprint 3 inventory does not include victim data.

## Proposed acceptance mapping

Use existing test IDs; add detailed cases to their definitions when the implementation scope is approved.

| Surface | Requirements/tests | Acceptance evidence |
| --- | --- | --- |
| Incident create/read/update/transition | FR-007; T-007, T-017; T-N01, T-N09, T-N10 | Role allow/deny matrix; legal/illegal edge matrix; tenant spoof/foreign ID denial; stale version and concurrent transition single winner; append-only redacted audit/event; no generic status PATCH. |
| Multiple locations | FR-009; T-009; T-N01, T-N09, T-N10 | Multiple named locations; same-tenant wrong-incident and cross-tenant FK rejection; invalid coordinates; parent/version conflict behavior and event/audit atomicity. |
| Change-event foundation | FR-022/NFR-001/NFR-004/NFR-010 as applicable; T-N01, T-N04, T-N09, T-N10 | Events commit/rollback with mutation, tenant/actor attribution, immutable sequence, no private fields, pooled-context isolation. No sync transport claim. |

The planned IDs define acceptance intent, not passing results. Sprint 3 must run fresh-up and upgrade migrations against disposable databases, runtime-role RLS tests, formatting/lint/typecheck/unit/integration/contract/build/scope checks, and document actual commands/results. Full recovery and backup/restore remain separate.

## Remaining implementation authorization and design gates

1. Obtain a separate explicit owner authorization before any Sprint 3 implementation.
2. Implement the approved role-specific cancellation-reason projection without leaking it into logs, telemetry, errors or notifications. Existing incident read operations may expose it only to authorized Incident Commanders and Control Room Operators; responders receive a minimized projection. The current `listAuditLogs` response does not expose audit metadata, so the Auditor’s specifically authorized reason view remains a deferred contract dependency; do not add an endpoint or grant in Sprint 3.
3. Q-05 remains OPEN for retention, lawful disposal, offline retention and related controls. Sprint 3 has no purge/scheduler and the append-only rule is not indefinite-retention approval.
4. Maintain M01-R01 OPEN and resolve separate recovery/deployment gates before production-like use.

**Final recommendation:** planning and contract freeze GO; implementation remains NOT AUTHORIZED. No code, migration, dependency, Docker or accepted implementation changes were made for this review.
