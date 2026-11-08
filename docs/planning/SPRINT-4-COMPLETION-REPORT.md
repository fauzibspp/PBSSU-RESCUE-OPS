# Sprint 4 Completion Report

**Assessment:** PASS for the authorized local scope; production use is not approved.
**Branch:** `feat/sprint-4-assignment-movement`
**Scope freeze:** `124cc37942e5f88124fcbc0013b92064e0bc2b4e`
**Execution date:** 2026-11-08

## Owner decisions and frozen scope

S4-P-01 records optional/nullable deferred duty with no default, invented
vocabulary, or request field. S4-P-02 records the Project Owner's approval that
one canonical `users.id` can have at most one active incident assignment across
all organizations. S4-P-03 through S4-P-09 remain as owner-approved in the
scope manifest and decision register. The scope is exactly three tables and
four existing API operations; bounded changes to `transitionIncident` and
`updateVehicle` do not add operation IDs.

## Delivered submilestones

- **Sprint 4-A — database foundation:** migrations `008-sprint4-permissions`
  and `009-sprint4-assignment-movement`; three approved tenant tables; exact
  four permission keys and role scopes; RLS/FORCE RLS; composite FKs; global
  responder and vehicle active uniqueness; one-time assignment release and
  immutable movement rows. Commit `c4e2aec0f4eb7aa6190bd0449ff68c1c6d9ae662`.
- **Sprint 4-B — assignment APIs:** `getAssignments`, `setAssignments`; active
  FIELD_RESPONDER membership and AVAILABLE vehicle checks; pre-dispatch
  replacement/release, history, no-op, re-add, version concurrency, generic
  uniqueness conflicts, and atomic audit. Commit
  `376e117ec373cb5f44c56d2bca532cdf0cbcf935`.
- **Sprint 4-C — movement APIs:** `listMovements`, `createMovement`; G-04/G-07
  authorization and assigned responder scope; server actor/receipt time;
  append-only correction lineage, replay protection, deterministic cursor
  ordering, and redacted note projection. Commit
  `1b7ec2507d8de005079255f258a6f7dd94903b3b`.
- **Sprint 4-D — lifecycle/resource integration:** only an explicit Control
  Room Operator `OPEN → DISPATCHED` after locking and validating eligible
  active responder and AVAILABLE vehicle assignment rows; updates to
  `MAINTENANCE`/`RETIRED` are rejected while assigned, under a shared vehicle
  row lock. No automatic dispatch, resource release, ON_SCENE, or terminal
  transition was introduced.

The full implementation and validation evidence is in
[Sprint 4 final acceptance](../testing/SPRINT-4-FINAL-ACCEPTANCE.md).

## Results

Fresh and repeat migration validation reports 29 tables and 54 permission
keys. The full integration suite passed 42 tests across 6 files; unit/contract
tests passed 19 across 2 files. Typecheck, lint, build, format, all Sprint 3/S4
scope checks and `git diff --check` passed. HTTP tests use the real Nest
authentication/MFA and tenant authorization path with synthetic identities and
the restricted PostgreSQL runtime role.

One full regression run exposed two outdated Sprint 3 assertions: the new
approved transition role boundary and the append-only cancellation event count.
The tests were corrected to reflect approved behavior, and the complete suite
then passed. A separate assignment-race test was corrected to avoid reusing a
synthetic responder already assigned by another scenario; the final focused
and complete suites passed.

## Remaining risks and future scope

M01-R01 remains OPEN; no downgrade/backup restore recovery is claimed. Q-05,
Q-06 and Q-08 remain OPEN. Production KMS, key rotation and recovery, production
logging validation, Auditor cancellation-reason access, and the future
post-dispatch release workflow remain open. Sprint 5 GPS/media/observations,
Sprint 6 offline synchronization, clients, external dispatch, agency
acknowledgement, deployment and real operational use are not included.

**Final local acceptance commit:** this Sprint 4-D completion commit.
