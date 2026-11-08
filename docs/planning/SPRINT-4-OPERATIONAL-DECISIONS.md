# Sprint 4 Operational Decisions — Historical Options

**Status:** Historical proposal record. S4-P-01 through S4-P-09 were APPROVED BY PROJECT OWNER on 2026-11-08 as recorded in [DECISION-REGISTER.md](DECISION-REGISTER.md) and reconciled in [SPRINT-4-CONTRACT-RECONCILIATION.md](SPRINT-4-CONTRACT-RECONCILIATION.md). This file preserves the original alternatives and rationale; it is not itself the final contract or scope freeze.
**Date:** 2026-11-08
**Related roadmap:** human assignments and append-only movement timeline (M06/M09).

Q-02 policies Q02-1 through Q02-9 remain approved as recorded in the decision register. The decisions below resolve implementation details that Q-02 explicitly leaves for future assignment/movement design. Recommendations are technical proposals, not operational policy.

**Supersession note:** the original options below were prepared before the 2026-11-08 owner decision. Where an option conflicts with that decision, the approved S4-P text in the decision register and contract reconciliation controls. Remaining implementation blockers are not approvals to choose another policy.

## S4-P-01 — Crew representation, duties, and command responsibility

**Current evidence:** The logical model has separate personnel and vehicle assignment rows. `AssignmentInput` accepts independent `membership_ids` and `vehicle_ids`. The response and schema include `duty`, but the input cannot supply it and the logical field is required.

**Superseding owner decision (2026-11-08):** The Project Owner approved an incident-level roster with individual personnel assignments; `PersonnelAssignment.duty` is optional and may be absent or NULL, the database has no default, and `AssignmentInput` remains unchanged. Duty vocabulary/designation is deferred. No vehicle-specific crew linkage is required. The alternatives below are retained as historical analysis, not open questions.

**Options:**

- A. Keep member and vehicle assignments independent; remove `duty` from the data model/projection or define a non-operational default through an approved contract change.
- B. Add explicit crew membership-to-vehicle linkage and owner-defined duties (for example, driver/crew lead) through a bounded schema/contract amendment.
- C. Require a separate human command/crew composition record with explicit command authority and minimum staffing rules.

**Recommendation:** Choose B only if vehicle crew membership and duty affect safe movement authorization; otherwise choose A and remove the unsupported required-duty field. Do not infer a default duty or invent command roles.

**Implications:** A is smaller but cannot prove which responder is operating a vehicle. B/C improve accountability but add schema and privacy rules and may require additional operations. Security must prevent an unassigned user from recording vehicle movement and minimize member identifiers in read projections.

**Owner question:** Are responders assigned independently to an incident or attached to a specific vehicle crew? Which duty values are allowed, which are mandatory, and who may designate the driver/crew lead? Should the current `duty` field be added to the request contract or removed?

## S4-P-02 — Responder eligibility and overlapping assignments

**Current evidence:** Memberships include ACTIVE/INACTIVE state and AVAILABLE/UNAVAILABLE availability. Q02-4 requires an eligible responder; Q02-6 explicitly limits one active incident assignment per vehicle, but does not define responder concurrency.

**Options:**

- A. Eligible means active tenant membership with AVAILABLE profile status at assignment time; allow multiple concurrent incident assignments only by explicit override.
- B. Same eligibility, plus at most one active incident assignment per responder.
- C. Eligibility is checked at dispatch time; assignment may reserve an unavailable responder for later review.

**Recommendation:** B for clarity and field safety, unless operations require a different duty/standby model. Recheck availability and active membership transactionally when dispatch is authorized.

**Implications:** A/C can over-allocate or dispatch unavailable members; B requires cross-incident uniqueness/race handling and a policy for availability changes after assignment. None should expose private contact details to assignment selectors.

**Owner question:** Must an assigned responder be ACTIVE and AVAILABLE? May a responder be actively assigned to more than one incident? What happens if availability changes after assignment?

## S4-P-03 — Assignment replacement, release, and re-add behavior

**Current evidence:** `setAssignments` is a full replacement PUT with incident `base_version`; its description says removed assignments are released and history is preserved. Empty arrays are contract-valid. Q02-7 bars silent release/reassignment in the emergency-breakdown path.

**Options:**

- A. Permit full replacement only before DISPATCHED; after dispatch, assignment changes require a separately approved release workflow.
- B. Permit routine post-dispatch changes with a mandatory reason and explicit Commander authority, while still blocking silent changes.
- C. Split add/release into separately reviewed commands in a later contract change.

**Recommendation:** A for ordinary Sprint 4 assignment changes; handle post-dispatch release only through a separately approved emergency/resource-release workflow. Reject an empty/replacement set that would silently remove active dispatched resources.

**Implications:** A is fail-safe but may leave a live assignment needing the emergency workflow. B/C require stronger audit, state ordering, permissions and possibly more API operations. Assignment history must support release and later re-add without overwriting prior evidence.

**Owner question:** Are empty lists allowed to release every assignment? At what incident state can `setAssignments` remove or replace active resources? May a released member/vehicle be re-added to the same incident, and how must each assignment period be preserved?

## S4-P-04 — Emergency breakdown, unavailability, reassignment, and stand-down

**Current evidence:** Q02-7 requires a designed emergency breakdown/release/reassignment workflow before Sprint 4 implementation. Q-02 already rejects routine maintenance/retirement while assigned and silent cancellation, release, or replacement. Current vehicle states are AVAILABLE/MAINTENANCE/RETIRED; no breakdown state is approved.

**Options:**

- A. Keep emergency breakdown handling unavailable in the MVP; prevent vehicle state changes and assignment release until an authorized operational process exists outside the platform.
- B. Add an explicit Commander-authorized breakdown/release record, reason, replacement eligibility check, and append-only history; design who can stand down/reassign.
- C. Treat an emergency as an ordinary `setAssignments` replacement plus `updateVehicle`, with reason/audit.

**Recommendation:** B only after exact authority, sequencing, and evidence are approved. Reject C because it would collapse the explicit Q02-7 emergency workflow into generic writes. A is the safe interim behavior if policy is not approved.

**Implications:** A may reduce system usefulness during breakdown but prevents unsupported state changes. B needs stronger command/audit and a consistent active-assignment lock. C risks silent release and contradictory availability. No automatic replacement selection or external notification is permitted.

**Owner question:** Who may declare breakdown/unavailability? What evidence and reason are required? Who can release and reassign the crew/vehicle? Must replacement be available before release? What incident state and audit trail represent safe stand-down? Is a new vehicle state value approved, or must current states remain unchanged?

## S4-P-05 — DISPATCHED and ON_SCENE evidence

**Current evidence:** Q02-4 defines DISPATCHED as an authorized internal assignment and requires at least one eligible responder plus one eligible AVAILABLE vehicle assigned to the same incident. Q02-1 defers DISPATCHED and arrival-dependent lifecycle edges until assignment and movement evidence exists. The existing `transitionIncident` operation is command-only and versioned.

**Options:**

- A. `setAssignments` creates internal assignment evidence; an authorized ordinary transition then moves to DISPATCHED only after both prerequisites exist. `ON_SCENE` requires an append-only ARRIVAL movement linked to the active assignment.
- B. Require a separate Commander confirmation for DISPATCHED and/or ON_SCENE in addition to assignment/movement records.
- C. Keep one or both transitions unavailable until a later operational evidence policy is approved.

**Recommendation:** A, with explicit on-demand human commands and no automatic state changes, if the owner confirms an ARRIVAL movement by an authorized assigned actor is sufficient evidence. Otherwise use C.

**Implications:** A gives a clear, testable state gate but assumes a movement record is trustworthy evidence. B adds human confirmation and audit burden. C preserves safety but leaves later lifecycle transitions unavailable. No response may imply external agency dispatch/acknowledgement.

**Owner question:** Is successful `setAssignments` plus the existing `transitionIncident` command sufficient for DISPATCHED? What exact actor/evidence is sufficient for ON_SCENE: any assigned crew member's ARRIVAL, only Commander confirmation, or a second-person confirmation? May movement evidence ever update incident status automatically? (Recommendation: no.)

## S4-P-06 — Movement authorship, time, correction, and evidence scope

**Current evidence:** `MovementInput` has `kind` DEPARTURE/ARRIVAL/RETURN/OTHER, UTC `occurred_at`, optional note, optional location and `supersedes_id`. The server returns `received_at` and actor membership. Movement rows are planned append-only; Sprint 4 does not include GPS/media.

**Options:**

- A. Allow an assigned responder to append movement for a vehicle crew they are explicitly linked to; retain both reported occurrence and server receipt times; corrections append a new row with mandatory reason and same-incident supersedes link.
- B. Allow an assigned responder to report only their own movement; Commander/Operator confirms movement before it counts for lifecycle transitions.
- C. Restrict all movement entry to Operator/Commander, with responders only supplying evidence through a later workflow.

**Recommendation:** A for basic timeline capture, with B's explicit limitation that raw movement is not verified arrival unless the owner approves the evidence threshold. Do not treat device time as trusted and do not infer GPS or agency acknowledgement.

**Implications:** A is usable in the field but needs robust attribution, correction chain, clock-skew limits and cross-vehicle checks. B is stronger for state transitions but can delay records. C may create an operational bottleneck. Append-only correction reason and lineage must be visible in an authorized redacted projection.

**Owner question:** Which roles may record each event kind? What maximum backdate/future clock skew is acceptable? Must corrections have a reason, and who may supersede a movement? Does an ARRIVAL entry establish operational arrival or only a reported observation? Should the Movement response expose `supersedes_id` and correction lineage?

## S4-P-07 — Cross-incident contention and transaction boundary

**Current evidence:** Q02-6 requires one active incident assignment per vehicle, enforced transactionally. Incident versions serialize changes to one incident but cannot by themselves prevent two different incidents from concurrently assigning the same vehicle. Responders' cross-incident limit is unspecified.

**Options:**

- A. Use database-enforced active assignment uniqueness plus deterministic row locks on candidate vehicles/memberships; return a stable conflict for a losing command.
- B. Serialize all assignments for a tenant with a tenant-level lock.

**Recommendation:** A; use tenant-level serialization only if measured database constraints cannot establish the approved invariant.

**Implications:** A scales and directly encodes the rule but requires partial uniqueness/history design and concurrency tests. B is simpler but reduces tenant throughput. Owner decision is needed only for the responder overlap rule; vehicle uniqueness is already approved by Q02-6.

**Owner question:** Confirm whether the one-active-assignment rule applies to vehicles only, as Q02-6 states, or also to responders. Confirm that a conflicting concurrent assignment must fail without partial mutation and require a fresh read/retry.

## S4-P-08 — Post-dispatch cancellation and safe stand-down

**Current evidence:** Q02-2 allows cancellation only from DRAFT/OPEN. Post-dispatch cancellation is deferred to a future authorized resource-release workflow. Q02-7 prohibits silently releasing assignments or selecting replacements.

**Options:**

- A. Keep post-dispatch cancellation unavailable in Sprint 4; provide no general stand-down command.
- B. Define a separate Commander-authorized stand-down/release sequence, preserving assignment and movement history, then allow cancellation only after resources are explicitly released.

**Recommendation:** B must be decided before implementing any post-dispatch release behavior; otherwise implement A and keep post-dispatch cancellation rejected.

**Implications:** A is safest but cannot digitally close a cancelled dispatched operation. B requires role authority, mandatory reason, resource confirmation and atomic audit/change history, potentially beyond the current four candidate operations. Do not reinterpret Q02-2 through generic assignment replacement.

**Owner question:** Is post-dispatch cancellation in Sprint 4 at all? If yes, who authorizes it, what exact release/stand-down evidence is required, and can cancellation occur while any active assignment remains?

## S4-P-09 — Contract/schema/event reconciliation

**Current evidence:** The logical schema describes required assignment `duty` but `AssignmentInput` supplies only membership and vehicle IDs. The schema's simple per-incident uniqueness can conflict with release/re-add history. `MovementInput` allows `supersedes_id`, but `Movement` omits it. Implemented Sprint 3 `change_events` only supports incident/location event types; assignments and movement are listed as future sync entities.

**Options:**

- A. Approve a bounded contract/schema revision before coding, including assignment duty/re-add, movement correction projection, event/change-feed representation, and exact permissions/scopes.
- B. Keep the existing four OpenAPI contracts unchanged and constrain behavior so unsupported semantics cannot occur; defer re-add/correction visibility/change-feed use.

**Recommendation:** A. These are observable contract/data-integrity gaps and cannot safely be resolved by undocumented defaults.

**Implications:** A may update logical entities and the already approved 75-operation contract without adding operation IDs, but needs explicit scope/version approval. B is smaller yet may prevent fulfilling full assignment/history/sync requirements. Existing change-event constraint changes must be a forward migration, never a historical migration rewrite.

**Owner question:** Approve a bounded pre-implementation contract/schema revision to reconcile these mismatches, or explicitly defer the affected capabilities? Confirm whether current OpenAPI operation IDs remain the only assignment/movement operations and approve the exact table/permission/migration delta separately.
