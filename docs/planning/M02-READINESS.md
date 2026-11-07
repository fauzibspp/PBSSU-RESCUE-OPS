# M02 Readiness and Scope Review

**Review date:** 2026-11-07
**Reviewed baseline:** M01 commit `fe5cbec0d2947bc0b8c0f87856e4f7e4f4fbf5b7` on `feat/m01-backend-foundation`
**Mode:** Documentation-only review. This document does not authorize implementation.

**Authorization update:** The project owner subsequently authorized the bounded Sprint 2 backend delta recorded in [Sprint 2 implementation notes](../development/SPRINT-2-IMPLEMENTATION.md). This supersedes the review-time “NO implementation start” state only for one `vehicles` table and `listVehicles`, `createVehicle`, `updateVehicle`; the navigation shell and all other excluded workflows remain out of scope. M01-R01 remains an unresolved production-like recovery gate.

## Recommendation: CONDITIONAL GO for planning; NO implementation start

The approved plan has no delivery milestone named M02. “M02” is a blueprint module label for Identity, Membership and RBAC, much of which was delivered as the backend foundation in M01. The next planned delivery item is **Sprint 2**, explicitly described in `IMPLEMENTATION-PLAN.md` as organization/member/vehicle/configuration administration and initial web/mobile navigation, spanning modules M01/M03/M04/M14. The proposed implementation scope below is the remaining Sprint 2 delta after M01. It requires owner approval as a distinct milestone before code begins.

Planning can proceed conditionally. The owner-approved implementation is limited to the tenant vehicle registry and excludes the navigation shell, incident lifecycle, assignments, dispatch, offline records, reporting, GPS and media. Operational transitions and assignment behavior remain gated on Q-02. Web/mobile build choices and delivery capacity remain gated on Q-08 and ADR-011 verification.

## Exact roadmap scope and delivered overlap

| Approved Sprint 2 item | M01 baseline evidence | Proposed remaining Sprint 2 delta |
| --- | --- | --- |
| Organization administration | Organization onboarding, list/detail/update operations and tenant-scoped RLS/RBAC are in the 40-operation M01 scope. | Reuse these services and contracts. Do not duplicate or broaden platform access. |
| Member/personnel administration | Invitations, personnel list/update, role assignment and settings are in the M01 scope. | Reuse the delivered identity/membership lifecycle. Additional profile fields or workflows require explicit requirement and permission traceability. |
| Vehicle administration | `vehicles` is in the logical schema and `listVehicles`, `createVehicle`, `updateVehicle` exist in OpenAPI, but none are in M01's 22 tables/40 operations or shipped migrations. | Implement only a tenant vehicle registry, conditional on review of fields and exact grants. |
| Organization configuration | `getSettings` and `updateSettings` are already in M01. | Reuse the allowlisted settings behavior; no new settings domain without approval. |
| Initial web/mobile navigation | Not implemented in M01. ADR-011 leaves exact frontend/mobile toolchain and encryption choices as future gates. | Thin authenticated navigation shells only if separately authorized and toolchain/device choices pass. No operational screens or offline cache. |

The OpenAPI specification is a wider logical product contract (75 operations), not a statement that 75 handlers or all logical entities are implemented. The M01 implementation was checked against its separate 40-operation/22-table inventory. Sprint 2 must identify its own exact increment and test only those newly implemented surfaces plus required regression coverage.

## Proposed Sprint 2 / M02 delta

### Module inventory

1. **M04 Vehicle Management (new backend domain):** tenant-scoped list/create/update; service-state changes guarded by optimistic version checks; redacted projections for assignment selection.
2. **M01/M03 administration reuse:** organization profile, membership/invitation, personnel and organization settings continue through M01 services. No replacement identity, immediate membership activation, or new role bypass.
3. **Web and mobile navigation shell (conditional):** authenticated entry, organization selection, permission-aware navigation and denial/empty/error states. No incident or vehicle assignment workflow. Use only toolchain versions approved after ADR-011 and Q-08 gates.
4. **Cross-cutting security:** exact tenant permission checks, tenant RLS, composite constraints, audit and version checks reuse the M01 architecture. New API/database paths require additional verification.

### Candidate API operations

| Operation ID | Proposed purpose | Candidate permission/group | Scope |
| --- | --- | --- | --- |
| `listVehicles` | List permitted vehicle projections in the selected tenant | Existing authorization model G-10/G-16 | `TENANT`; G-16 projection must omit administrative/private fields |
| `createVehicle` | Register a tenant-unique call sign and approved vehicle attributes | G-10 | `TENANT`; organization administration only |
| `updateVehicle` | Change approved vehicle attributes/service state with version precondition | G-10 | `TENANT`; reject stale versions and invalid state changes |

These operation IDs and groups appear in the logical OpenAPI/authorization design and the approved Q-01 permission model, but they are not part of the M01-shipped 40-key permission catalogue. M02 must use a reviewed additive migration to seed only those already approved exact keys and extend the contract-to-controller/role mapping. Verify the M01 catalog subset against the approved full catalogue before implementation; obtain new approval only for any proposed role/key deviation. No wildcard permission or implicit grant is allowed. Do not change historical M01 migrations or silently add vehicle keys to the frozen M01 inventory.

### Proposed database addition

Add `app.vehicles` through a new forward migration, with UUID primary key, `organization_id`, tenant-unique `call_sign`, allowed `service_state` (`AVAILABLE`, `MAINTENANCE`, `RETIRED`), version/timestamps, and only the registration details needed by approved operations. If registration identifiers are retained, store ciphertext and omit them from G-16 projections. Add `UNIQUE (organization_id,id)`, tenant-leading indexes, RLS plus FORCE RLS, and organization-scoped policies. M01 already supplies organizations, role grants, permission catalogue, audit and identity entities; do not duplicate them.

Vehicle/incident assignment tables are outside this proposed delta. Q-02 must resolve assignment eligibility, no-vehicle incidents, maintenance/retirement during an active assignment, dispatch prerequisites and transition guards before assignment or incident workflow implementation.

### Permission and role policy

- Preserve the approved six role templates and deny-by-default exact grants.
- Candidate G-10 vehicle administration grants are for Organization Admin only unless owner-approved policy changes the matrix.
- Candidate G-16 read-only vehicle labels are for Control Room Operator and Incident Commander for assignment selection; this does not grant incident assignment authority or access to registration/private fields.
- Platform Super Admin receives no vehicle/tenant operational access by platform status.
- Field Responder receives no vehicle directory grant unless a later approved API needs a minimal assigned-incident projection.
- Auditor remains read-only under the existing approved template; determine explicitly whether the vehicle registry is in its allowed audit scope before granting any vehicle listing permission.
- Role catalogue additions must remain distinct from actor possession and delegation bounds. Tests must cover prohibited self-grant and cross-tenant access.

The G-10/G-16 mapping above follows the approved authorization model. The owner must approve the bounded M02 inventory and any deviation from that matrix before implementation/migration.

## Reusable M01 capabilities

- NestJS modular monolith structure, runtime configuration, DTO validation, OpenAPI contract checks and loopback-only development setup.
- User/session/MFA and invitation activation lifecycle; tenant membership selection; current permission checks; grant delegation limits and deny-by-default behavior.
- Kysely/pg connection and checked-out transaction context; RLS/FORCE RLS patterns; composite tenant foreign keys; migration-owner/runtime separation.
- Audit-writing patterns, redacted generic response handling, synthetic identity fixtures and controlled mock delivery policy.
- Unit/integration/lint/typecheck/build/scope tooling and the authorized 22/40 M01 baseline.

Reuse must be demonstrated through behavior and tests. The logical contract alone is not runtime support for unimplemented operations.

## Incomplete prerequisites and blockers

| Gate | Status/effect |
| --- | --- |
| **M01-R01 migration recovery** | Open. M01-F applied migrations 001/002 but the guarded down operation refused because the migration-seeded permission table is populated. Full up/down/up is unverified. Resolve with the safe strategy and acceptance evidence below before relying on downgrade/recovery. It does not require editing M01 history. |
| **Q-02 operational rules** | PENDING stakeholder decision. Blocks incident lifecycle, cancellation/reopen, no-vehicle handling, assignment prerequisites, vehicle eligibility during active incidents, movement authority and maker/checker behavior. Vehicle registry CRUD can be isolated from these behaviors, but must not encode assumed operational semantics. |
| **Q-01 permission extension** | Base deny-by-default model and full logical role matrix approved. Vehicle keys/groups G-10/G-16 are specified there, but are not in M01's shipped 40-key catalogue. M02 needs an additive migration and exact parity check; stakeholder approval is needed only if changing the approved matrix. |
| **Q-08 delivery/device readiness** | PENDING. Team capacity, Android/iOS minimum versions, macOS build access and test device inventory are unresolved. Blocks a reliable web/mobile navigation commitment and estimate; can be removed from M02 if owner limits the milestone to backend/API. |
| **ADR-011 toolchain verification** | Backend baseline is pinned and exercised locally. React/Vite and Flutter/SQLite encryption choices remain candidate/future gates. No mobile package or encryption dependency should be selected by inference. |
| **M01 runtime residuals** | Production key custody, Windows ACL behavior, rate limiting, TLS termination, production provider/deployment and disaster recovery remain untested. Do not make production or pilot claims. |

Q-05 (retention/offline/lost-device) blocks offline caching/sync; Q-06 (hosting, backup owner, RPO/RTO/support) blocks deployment/recovery commitments; Q-09 blocks victim-data fields/access. None should be pulled into this Sprint 2 proposal.

## M01-R01: permission-catalog migration recovery limitation

**Finding:** M01 migration `002-permission-catalog` inserts 40 catalog rows into `app.permissions`. The existing rollback preflight refuses any `down` while any `app` table has rows, so a fresh migrated database cannot pass a full down/up cycle without changing the recovery design. M01-F recorded a safe refusal and preserved schema/data. Do not delete seed/audit rows manually, disable the guard, or edit already committed migration history.

**Recommendation:** adopt a **forward-only migration policy for shared, persistent and production-like environments**. Treat committed migrations as immutable. Correct schema/catalog errors with a new reviewed forward migration. For recovery from a bad deployment, use a verified backup/point-in-time restore into a separately provisioned target, not ad hoc down migrations. For disposable local tests, recreate only a uniquely identified M01-F/test resource after confirming identity and absence of protected/external data; never use broad Docker cleanup.

If reversible migration behavior is still required for development, design it as an explicit future migration-runner capability. It must identify migration-owned seed data by immutable provenance, verify exact expected values and absence of dependent grants/application records, remove only rows introduced by that migration, and preserve all user-created or referenced catalog entries. The existing migration history remains unchanged; the change would be a new migration and runner version, reviewed before use. Until then, record downgrade as unsupported.

**Acceptance tests for the chosen forward-only/recovery policy:**

1. Fresh isolated database applies every migration in order; a second migrate-up is a no-op with unchanged schema/catalog counts and migration identifiers.
2. A deliberately failing forward migration is atomic (no partial DDL/data state) or leaves a documented, detectable failed state with a safe forward repair procedure; never auto-run a broad down.
3. A migration adding catalog entries preserves all existing/custom grants and does not overwrite edited descriptions or remove referenced keys.
4. The migration runner refuses rollback on seeded or application-populated data with no schema/data mutation; verifies current warning/error is actionable and does not expose credentials.
5. Backup/restore drill restores into a new isolated target, verifies migration metadata, exact permissions, RLS/FORCE RLS, composite constraints and representative synthetic records, then passes runtime-role tenant-isolation checks.
6. Recovery rehearsal demonstrates the operator can switch traffic/connection configuration to the restored target only under a separately approved deployment procedure; this is future operational acceptance, not a local M02 feature.

If reversible development migrations are later approved, add tests for exact seed ownership, references blocking removal, rollback of 002 followed by 001 only on an empty isolated database, up/down/up equivalence, and non-mutation on any mismatch. Do not claim these tests pass until implemented and run.

## Proposed milestones and acceptance criteria

| Gate | Scope | Exit criteria |
| --- | --- | --- |
| M02-A — scope/policy freeze | Approve vehicle fields, new operation keys, G-10/G-16 matrix, backend-only vs navigation-shell boundary; decide Q-08 path | Signed scope correction, updated OpenAPI/traceability and role-permission table; Q-02-dependent assignment rules explicitly excluded or approved |
| M02-B — schema/API foundation | Add `vehicles` and additive permission migration; controllers/services for the three operations | Fresh and upgrade migration checks; constraints, tenant RLS/FORCE RLS, rollback-refusal behavior, exact permission catalogue and schema tests |
| M02-C — authorization/integration | Implement vehicle use cases and redacted projections | Runtime-role tests for no context, cross-tenant read/write, composite FK/uniqueness, denied grants, platform-only denial, role delegation, stale version and concurrent call-sign creation |
| M02-D — client navigation (only if approved) | Web/mobile authenticated shell and organization selection/navigation | Approved versions/build targets; accessibility and auth/session/tenant switch tests; no cached operational data or incident screens |
| M02-E — acceptance | Update docs/traceability and execute regression/security gates | Format/lint/typecheck/unit/integration/build/OpenAPI/scope checks; no extra tables or APIs beyond approved M02 inventory; review residual risks and acceptance report |

**Approved bounded backend inventory:** 1 new table (`vehicles`) and 3 new API operations (`listVehicles`, `createVehicle`, `updateVehicle`). Existing M01 tables and operations are reused, not counted as new scope. The roadmap's initial web/mobile navigation item is explicitly excluded by the current owner authorization; Q-08 remains open for a future client increment.

## Mismatch review

1. **Milestone/module naming:** blueprint module M02 means identity/membership/RBAC, while there is no M02 delivery milestone in the approved implementation plan. Sprint 2 is the evidence-based next candidate.
2. **Schedule overlap:** Sprint 2 lists organization/member/configuration work that M01 already implements in its 40 operations. Avoid duplicate handlers and define an approved delta.
3. **Contract versus implementation:** OpenAPI and traceability describe 75 product operations/40 logical entities; M01 implements only its 40-operation/22-table foundation slice. `listVehicles`, `createVehicle`, `updateVehicle` are contract designs, not shipped handlers or schema.
4. **Permission catalog lag:** authorization documentation defines approved G-10/G-16 vehicle rights, but the M01 permission catalogue is limited to 40 foundation keys. New migration must seed the approved subset without changing the role matrix.
5. **Operational assumptions:** proposed vehicle `AVAILABLE/MAINTENANCE/RETIRED` states exist in the logical dictionary, but policies for assignment/transition interactions are Q-02 decisions. Registry state management must not imply dispatch authority.
6. **Recovery posture:** the plan expects migration/recovery evidence, but M01-R01 means downgrade is unsupported under current guard. Adopt forward-only plus restore validation rather than representing rollback as accepted.
7. **Client dependencies:** blueprint calls for Flutter/React; ADR-011 marks exact toolchain/encryption choices for later verification, and Q-08 is unresolved. Client shell cannot be committed to schedule until those gates clear.

## Decision-register changes

The decision register now records M01-R01 as an open implementation risk and retains Q-02/Q-05/Q-06/Q-07/Q-08/Q-09 as pending. No stakeholder decision has been marked approved. This readiness report is planning evidence only; it does not authorize implementation, data migration, Docker activity, commit or deployment.
