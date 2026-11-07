# Q-02 Operational Policy Proposal

**Status:** APPROVED BY PROJECT OWNER 2026-11-07. This proposal preserves the alternatives and rationale presented for decision; the owner’s selected policies are recorded below.  
**Context:** Sprint 3 is planned for incident lifecycle, multiple locations and a change-event foundation. Assignments and vehicle movement are Sprint 4. These recommendations are designed to preserve that sequence and the approved Q-01 authorization model.

## Decision summary for the owner

The owner should answer each approval question below. “Recommended” is the architecture/operations proposal, not an adopted rule. If a policy requires a capability scheduled for Sprint 4, its dependent transition should remain unavailable until that capability is implemented and tested.

### Q02-1 — Incident lifecycle graph and command boundary

**Recommended policy:** Create an incident in `DRAFT`; explicitly open it to `OPEN`. Keep the normal progression `OPEN → DISPATCHED → ON_SCENE → MONITORING → RETURNING → COMPLETED → CLOSED`, with a direct `ON_SCENE → RETURNING` path for incidents that do not need extended monitoring. Every state change uses `transitionIncident`, requires the current `base_version`, validates a documented edge and writes one audit/event record atomically. `updateIncident` changes allowlisted descriptive fields only; it cannot alter status.

`DISPATCHED` and later transitions whose guard depends on assignment or arrival evidence are gated on Sprint 4’s real assignment/movement records. Until then, Sprint 3 may create/open incidents and record locations, but must reject those transitions with a stable “prerequisite unavailable” conflict; it must not synthesize an assignment, movement, arrival or dispatch acknowledgement.

**Alternative:** Implement the full graph in Sprint 3 by moving assignment/movement entities and APIs forward. This expands the approved roadmap increment and requires a separately approved scope correction, dependencies and tests.

**Implications:** The recommended staged graph gives a usable incident register before assignment work, while leaving dispatch state truthful. The alternative may reduce sequencing friction but makes Sprint 3 larger and entangles G-06 assignment authority with Q-02 lifecycle behavior.

**Security implications:** A command-only state machine prevents generic patch bypass. Server-side guards, selected-tenant permission checks, transaction serialization and stale-version rejection prevent unauthorized or concurrent status changes. No client-supplied role, tenant or actor establishes authority.

**Owner approval question:** Approve this staged state graph and defer `DISPATCHED`/assignment-dependent transitions until Sprint 4, or approve an explicit Sprint 3 scope expansion for assignments and movement? Should the direct `ON_SCENE → RETURNING` path be valid?

### Q02-2 — Cancellation eligibility and terminal states

**Recommended policy:** Permit cancellation from `DRAFT` or `OPEN` with a mandatory reason, authorized command and immutable audit/event. Do not cancel `COMPLETED` or `CLOSED`. Once Sprint 4 assignment begins, cancellation from dispatched/active states is permitted only through a commander command that records the reason and atomically releases or otherwise resolves active assignments; keep that path unavailable until the corresponding release behavior exists.

**Alternative A:** Allow cancellation from every nonterminal state, but require an explicit stand-down/release workflow and stronger review after assignment. **Alternative B:** Never use `CANCELLED` after opening; complete with an outcome such as “operation stood down.” This avoids a second active-work terminal path but can blur canceled versus completed semantics.

**Implications:** A reason distinguishes cancellation from completed operations. Restricting post-dispatch cancellation until release semantics are real avoids orphaned assignments and falsely available vehicles. A broad cancellation rule is operationally flexible but needs carefully ordered resource release and audit.

**Security implications:** The approved permission model gives commanders the closure/cancellation group (G-12); operators receive normal transitions only (G-15). Every cancellation needs actor, prior/target state, version, reason and timestamp in redacted audit/event data. No platform-admin or tenant-admin implicit bypass.

**Owner approval question:** From which states may an incident be canceled? Is cancellation after assignment allowed only when all active resource assignments are released in the same operation? May an operator initiate cancellation, or must a commander perform it?

### Q02-3 — Completion, closure and reopening

**Recommended policy:** `COMPLETED` requires a nonempty operational outcome; `CLOSED` is allowed only from `COMPLETED` after an Incident Commander review. Closing is a separate lifecycle action from completing field work. Reports can remain draft/unsubmitted after closure; report approval is a separate Sprint 7 workflow. Do not reopen `CLOSED` or `CANCELLED` incidents in the MVP. Correct factual history through an append-only, versioned amendment/change event in a separately authorized workflow, not by rewriting the terminal state.

**Alternative:** Allow a commander to reopen a closed incident with a reason and fresh base version, preserving every prior state transition and requiring a later re-close. A two-person reopen is a stronger alternative for exceptional cases.

**Implications:** Terminal states make operations and audit reports stable. Reopening supports genuine late developments but increases client, report-snapshot and notification complexity and raises questions about approved reports.

**Security implications:** Closure stays commander-only per G-12. Reopen is not in the current OpenAPI state transition semantics and must not be enabled by generic PATCH. If approved later, require a new explicit command, recent privileged MFA, reason, full audit and report-version impact rules.

**Owner approval question:** Should closed/cancelled incidents be irreversible for MVP? If not, who may reopen, what evidence/reason is mandatory, and what happens to already submitted or approved reports?

### Q02-4 — Dispatch prerequisites and availability of resources

**Recommended policy:** Treat `DISPATCHED` as an internal record of an authorized human assignment, never as automated dispatch or official agency acknowledgement. Before it can be entered, require at least one active eligible responder and one eligible vehicle assigned to the same incident, with active membership, correct tenant, non-retired/available vehicle, and no conflicting active assignment. Arrival requires separately recorded arrival evidence in Sprint 4 movement/location capabilities. Validate all prerequisites in the same transaction as assignment/state change.

**Alternative A:** Permit an incident to enter `DISPATCHED` with only a responder or only a vehicle. **Alternative B:** Allow a commander to override missing resources with a reason. **Alternative C:** Add an explicit “resource requested/unavailable” state; this is a new lifecycle concept and API/contract scope.

**Implications:** Requiring both resources accurately represents a staffed vehicle deployment but may not fit operations where responders travel independently or external agencies provide resources. Overrides improve flexibility but can make the state ambiguous. A new state carries additional contract, data and training cost.

**Security implications:** Exact G-06 `setAssignments` authority is a human command, not automatic dispatch. No notification, radio transmission, agency acknowledgement or emergency-resource dispatch is implied by a database state. Overrides need a separately granted permission and a non-empty justification; do not add one implicitly.

**Owner approval question:** What minimum assignment is required before `DISPATCHED`: both a responder and vehicle, either one, or a commander-approved exception? Does the internal state mean assignment completed only, or also that a human confirmed external communication? The system must not claim the latter without evidence.

### Q02-5 — Incident with no available vehicle

**Recommended policy:** Allow creation and opening of an incident when no vehicle is available. Keep it `OPEN`, visibly indicate the unmet vehicle prerequisite, and do not create an assignment or transition to `DISPATCHED`. A separate approved operational channel may be used; the system records no agency response or dispatch unless a later evidence workflow explicitly captures it.

**Alternative A:** Block incident opening until a vehicle is available. **Alternative B:** Allow a commander to dispatch without a vehicle under a documented exceptional authorization. **Alternative C:** Add a vehicle-unavailable/resource-request state and related permission/API.

**Implications:** The recommendation keeps incident capture available during resource shortages without overstating response status. Blocking OPEN loses early records. An override or extra state changes operational meaning and requires training and more audit/reconciliation.

**Security implications:** A missing-resource warning is informational, not a grant. No auto-dispatch or outbound notification is triggered. A local client cannot self-assert an unavailable/assigned resource.

**Owner approval question:** Confirm that an incident may be created/opened without a vehicle but must remain undispatched. If not, which explicit exception or additional state is authorized and who can invoke it?

### Q02-6 — Vehicle eligibility and simultaneous assignments

**Recommended policy:** A vehicle is eligible only when tenant-owned, `AVAILABLE`, not retired, and not already on an active incident assignment at the time the assignment transaction commits. A vehicle may have at most one active incident assignment across that tenant. `MAINTENANCE` and `RETIRED` vehicles are ineligible. Responder assignments require an active membership and a compatible approved role; assignment never grants new tenant permissions.

**Alternative:** Permit multiple concurrent incidents per vehicle with an explicit capacity/overlap rule; or allow commander override under a distinct permission and reason.

**Implications:** One-active-assignment rules are simple and prevent impossible resource accounting, but may be too restrictive for shared standby or multi-vehicle units. Capacity modeling expands beyond current vehicle fields and needs operational definitions.

**Security implications:** Enforce eligibility inside the same transaction, with database uniqueness/exclusion or locking sufficient to prevent concurrent double assignment. Do not rely on a prior client list. Tenant-composite FKs bind vehicles and memberships to the incident organization.

**Owner approval question:** Is one active incident assignment per vehicle the rule? Can a vehicle support multiple incidents, and if so what capacity, overlap, or explicit override policy applies?

### Q02-7 — Maintenance/retirement while assigned

**Recommended policy:** Reject `updateVehicle` to `MAINTENANCE` or `RETIRED` while active assignments exist. Require an authorized human to release/reassign those assignments first; perform the final vehicle-state change only after confirming no active assignment remains. Preserve assignment history. Do not silently cancel an incident or auto-select replacement resources.

**Alternative A:** Permit a maintenance flag during an active assignment but mark it as an operational exception requiring commander acknowledgement and reassignment. **Alternative B:** A single commander command atomically marks unavailable and releases the vehicle, with a mandatory reason and reassignment/stand-down decision.

**Implications:** Blocking prevents a vehicle appearing both unavailable and actively committed, but emergency breakdowns need an immediate operational record. The alternatives need a defined breakdown/relief process and likely a new command/API or assignment status.

**Security implications:** Sprint 2 `updateVehicle` currently changes service state but has no assignment table to check. Sprint 4 must add a cross-module guard and concurrency test before assignments exist. G-10 vehicle administration alone should not decide or alter incident assignment history.

**Owner approval question:** Should an assigned vehicle's maintenance/retirement update be blocked until reassignment/release, or is an emergency unavailable-and-release command required? Which role can perform that command and what evidence is mandatory?

### Q02-8 — Operational roles and maker/checker

**Approved policy:** Preserve Q-01 exactly. Control Room Operator performs ordinary incident transitions through G-15. Incident Commander alone controls cancellation/closure through G-12. Field Responder reads only assigned incident projections and cannot change incident lifecycle; Organization Admin and Read-Only Auditor gain no operational rights by default; Platform Super Admin has no tenant-content access. Do not grant new permissions via role labels or privilege inheritance.

For MVP, one authorized human may perform an allowed operational transition. There is no mandatory different-person maker/checker requirement. Report approval remains a separate Sprint 7 policy governed by its own approved requirements.

**Alternative:** Require two distinct authorized users for all cancellation/closure and post-dispatch exceptional changes. This strengthens separation of duties but may be unavailable during single-operator volunteer shifts. Another alternative is same-actor operation with reason and enhanced audit.

**Implications:** Current Q-01 groups already encode role boundaries, but the SRS/openapi descriptions do not fully specify opener/commander separation or emergency exceptions. Adding separation requires relationship tracking and tested authorization, not merely a UI confirmation.

**Security implications:** No self-grant or platform bypass. Every transition checks the current role grant and required assurance at execution. Sensitive reason text must be bounded and screened from public telemetry. Any second-person rule must check distinct user IDs server-side.

**Owner approval question:** Confirm the approved Q-01 role mapping for incident operations. Must the closing/canceling commander differ from the incident creator or last operator? Is one-person operation permitted during an emergency, and if so what reason/audit rule applies?

### Q02-9 — Concurrency, audit and version semantics

**Recommended policy:** All incident lifecycle commands carry `base_version`; a compare-and-swap update increments version once and appends exactly one state-change event and audit record in the same tenant transaction. A stale version returns conflict without mutation. A concurrent duplicate transition has one winner; the losing request rereads state and returns conflict. Location writes commit with the corresponding tenant event and audit. Change events are append-only; corrections are new events, never row rewrites.

The owner selected option (1): `LocationInput` carries the parent `base_version`, and successful creation increments the incident version exactly once. Option (2), a separate location collection version without changing the parent incident version, remains a documented alternative but is not selected. Do not silently serialize location creation against an absent version.

**Alternative:** Use serializable/locked parent transactions without a client version for every operation. This avoids changing location DTOs but can increase contention and does not expose lost-update conflicts clearly to offline-capable clients.

**Implications:** Explicit versions support deterministic client conflict handling and truthful audit chronology. A server-only lock is simpler initially but makes future sync semantics harder; full client idempotency is not Sprint 3 sync implementation.

**Security implications:** Establish tenant/user transaction context before row access. Write domain row, event and audit atomically; prevent cross-tenant cursor or event visibility. Do not place victim/contact data in generic event payloads. Concurrency tests must use the restricted runtime role and real concurrent connections.

**Owner approval question:** Approve compare-and-swap `base_version` semantics for each command? Should adding a location increment the incident version (adding the missing version to the request) or use a separate location collection version? Which event fields may be retained and who can read them?

## OpenAPI/traceability items after decisions

The existing OpenAPI contract provides `createIncident`, `updateIncident`, `transitionIncident`, `listIncidents`, `getIncident`, `listLocations`, and `createLocation`. `transitionIncident` currently claims assignment and arrival guards; Q02-1/4 must either constrain that statement to implemented Sprint 4 dependencies or approve moving those dependencies into scope. `setAssignments` and movement operations belong to Sprint 4, and should remain unimplemented in Sprint 3.

Current traceability maps FR-007 to T-007/T-017 and FR-009 to T-009. Add or refine cases for every approved edge, denied edge, cancellation/reopen rule, missing-resource case, role matrix, stale-version race, event atomicity and redaction before implementation. Update SRS, OpenAPI, authorization model, schema/data dictionary, ERD and traceability together after decisions; do not change those contracts based on this proposal alone.

## Formal approval record

Q-02 status: **APPROVED BY PROJECT OWNER**

Decision authority: **Project Owner**

Decision date: **2026-11-07**

Approved items: **Q02-1 through Q02-9**, as specified in the project-owner instruction and summarized in [DECISION-REGISTER.md](DECISION-REGISTER.md). The Project Owner also approved Decision A (role-specific cancellation-reason visibility) and Decision B (append-only records, no Sprint 3 purge) on 2026-11-07. The original options and rationale above remain as decision history; these approvals supersede their pending status.

Approved Sprint 3 inventory: exactly three tables (`incidents`, `incident_locations`, `change_events`) and seven operations (`listIncidents`, `createIncident`, `getIncident`, `updateIncident`, `transitionIncident`, `listLocations`, `createLocation`).

Selected policies: Q02-1 staged lifecycle and deferred assignment/arrival transitions; Q02-2 cancellation from DRAFT/OPEN only, Commander plus reason; Q02-3 outcome-required completion, Commander closure review, no reopen; Q02-4 both eligible responder and AVAILABLE vehicle for DISPATCHED; Q02-5 permit DRAFT/OPEN without vehicle but no dispatch; Q02-6 one active assignment per AVAILABLE tenant vehicle; Q02-7 reject routine maintenance/retirement while assigned and defer breakdown release workflow to design before Sprint 4; Q02-8 preserve Q-01, Operator ordinary transitions, Commander cancellation/closure, no mandatory distinct-person check; Q02-9 atomic base_version/CAS, event and audit, append-only events and parent-versioned location creation.

### Final approved decisions (Project Owner, 2026-11-07)

- **Cancellation reason:** restricted operational information. Incident Commander and Control Room Operator may read full reason for authorized tenant incidents; responder projection contains CANCELLED status and minimum operational information; Organization Admin and Platform Super Admin have no automatic access. Auditor access is limited to a specifically authorized audit view. Existing `listAuditLogs` returns redacted records without metadata, so it does not currently meet that requirement. No operation/permission/schema expansion is approved here; auditor access is a deferred contract dependency. No reason in generic logs, public telemetry, unauthorized notifications or unredacted errors.
- **Append-only / retention:** ordinary APIs cannot alter or delete change events or audit records; corrections are new authorized events. No automatic purge/scheduler in Sprint 3. Q-05 remains OPEN and this decision does not authorize indefinite retention. Any deletion/anonymization/legal-retention/archive process needs separate policy and implementation approval.

Explicit deferrals: assignment/dispatch implementation, assignment-dependent transitions and post-dispatch cancellation/release, movement, GPS/media, offline sync, reporting and all later roadmap features. Vehicle breakdown/release workflow must be designed before Sprint 4 implementation.

**Authorization boundary:** This is approval of policy and documentation/contract freeze only. Sprint 3 application implementation is **NOT AUTHORIZED**. M01-R01 remains OPEN; no recovery evidence is implied.
