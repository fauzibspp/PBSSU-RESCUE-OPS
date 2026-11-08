# PBSSU Rescue Ops — Autonomous Development Orchestrator

**Status:** Proposed agent operating policy; effective for development only once adopted into the repository.
**Owner authorization:** Routine local engineering work, test repair, documentation, feature branches and local commits may proceed without repeated approvals **within an already approved, exact scope**.
**Does not grant:** autonomous production deployment, emergency dispatch, bypassing security controls, force-push, destructive database actions, changes in stakeholder operational policy, or unrestricted merges.

## 1. Read before acting

Read `AGENTS.md`, `docs/planning/IMPLEMENTATION-PLAN.md`, `docs/planning/DECISION-REGISTER.md`, relevant approved ADRs, SRS, OpenAPI, authorization model, data dictionary, database design, test strategy, latest sprint reports, and the current Git state. Existing approved policy and `AGENTS.md` take precedence over this document if they conflict. Do not infer operational approval from a draft or stale document.

## 2. Operating state machine

Use these transitions only:

`BASELINE_VERIFY → BACKLOG_SELECT → READINESS_REVIEW → SCOPE_CHECK → IMPLEMENT → VALIDATE → REVIEW → LOCAL_COMMIT → REPORT → NEXT_IN_SCOPE`.

At any gate, transition to `BLOCKED` on missing approval, failed critical security test, unverified base, unknown architecture choice, destructive action, or conflicting evidence. No automatic loop from BLOCKED into implementation.

- **BASELINE_VERIFY:** Verify official origin with `git ls-remote`, fetch non-destructively, inspect clean worktree and local/remote ancestry, confirm last accepted main and hotfix changes. Never reset/rebase/overwrite unrelated local changes.
- **BACKLOG_SELECT:** Select the first unmet delivery increment in the implementation plan. Module IDs M01–M14 are not delivery milestones. Use Sprint 4 readiness next; do not skip owner-policy gates.
- **READINESS_REVIEW:** Produce dependency and delta analysis, exact proposed entities/operations/permission keys, state transitions, test map, risks and unresolved owner choices. This is documentation only unless the exact implementation scope is already approved.
- **SCOPE_CHECK:** Cross-check an approved scope manifest, Q-01/Q-02, OpenAPI, ERD and permissions. Planning approval does not imply a new permission/API/schema expansion. If open choices materially affect behavior, stop and record recommended alternatives.
- **IMPLEMENT:** Implement one bounded slice at a time on a feature branch. Preserve historical migrations. Use synthetic data; no real responder/victim identities or emergency actions.
- **VALIDATE:** Execute the project's actual existing commands and new targeted tests. Explicitly distinguish not-run, mocked and real HTTP/restricted-database tests. Never claim PASS without evidence.
- **REVIEW:** Security review must cover selected-tenant RLS/FORCE RLS, tenant-composite FKs, RBAC, assurance/MFA, version and concurrency, audit atomicity, event redaction, cryptographic key handling, and unintended API or role expansion.
- **LOCAL_COMMIT:** Only after passing the defined mandatory gates; small and descriptive. No automatic push/PR/merge unless that specific action is separately permitted. Record commit SHA and clean/dirty status.
- **REPORT:** Update an on-repo milestone journal. Report exact performed commands, evidence, files, open risks and next justified action. Do not imply future activity will continue after the Codex process ends.
- **NEXT_IN_SCOPE:** Continue to another task only within the same approved implementation scope and active agent session. Otherwise stop at scope boundary and produce a proposed next-step instruction.

## 3. Autonomous decision rights

**Can decide locally:** names/internal organization consistent with approved conventions; code structure/refactoring; safe dependency-free fixes; test additions; isolated disposable test resource selection; non-destructive migrations that exactly implement approved schema; local feature branches and local commits; documentation corrections that do not alter operational policy.

**Requires an explicit stakeholder decision or stop:** minimum dispatch prerequisites or their exceptions; assignment/release/vehicle breakdown authority and evidence; new role grants; changing Q-02 lifecycle; retention/deletion Q-05; hosting/recovery Q-06; privacy/victim data Q-09; new external notifications; data-model/API expansion beyond frozen scope; ambiguous safety-critical behavior. The agent may prepare options but must not adopt them as owner policy.

**Never autonomously:** access real incidents, dispatch responders, notify external agencies, bypass MFA/RLS, disclose secrets, force push, rewrite shared history, delete production data, erase unrelated Docker resources, deploy/pilot/merge to main, or claim production readiness.

## 4. Acceptance gates

All applicable gates must pass:

1. Verified base/ancestry and branch isolation.
2. Exact scope diff and permission parity; no surprise tables or operations.
3. Fresh + repeat/no-op migration tests; historical migrations unchanged; database constraints and restricted-role RLS/FORCE RLS checks.
4. Real HTTP auth/MFA/tenant selection/RBAC tests for sensitive API paths, not just test authenticator fixtures.
5. Cross-tenant negative tests and concurrent/stale-version races.
6. Atomic event and audit writes; append-only protections and redacted responses.
7. Format, lint, typecheck, build, tests and `git diff --check`.
8. Changed-range secret scan, with no real identities, locations, credentials, keys or data dumps.
9. Report known open issues unchanged unless specifically closed by evidence.

**Open gates inherited:** M01-R01 restore/recovery; Q-05 retention; Q-06 hosting and DR ownership; Q-08 client/device readiness; production KMS and logs; restricted Auditor cancellation reason view; Sprint 4 assigned-only responder access. A passing development sprint does not close these.

## 5. Sprint 4 sequencing

Implement **nothing** from Sprint 4 before readiness and scope freeze. Plan Sprint 4 around human-approved assignments and append-only movement timeline (modules M06/M09; implementation plan Sprint 4). Respect Q-02: `DISPATCHED` is internal human assignment evidence, not external agency notification/acknowledgment; at least one eligible responder and one AVAILABLE eligible vehicle; one active vehicle assignment; block routine maintenance/retirement while actively assigned. Emergency breakdown/release and post-dispatch cancellation are unresolved operational workflows and require separate policy decisions before implementation.

The Sprint 4 readiness artifact must explicitly distinguish exact proposed vs approved table and operation inventories, affected existing vehicle/incident operations, RLS and tenant-composite FKs, role grants, concurrency, required vehicle availability guards, assignment evidence, append-only movements, fail-closed responder reads, and incident transition integration. Do not invent counts.

## 6. Journal and execution bounds

Record each run in `docs/planning/AUTONOMOUS-RUN-JOURNAL.md` with timestamp, branch, base SHA, step, decision source, tests actually run, commit SHA, blockers and next action. Avoid credentials, real-person details and raw sensitive telemetry.

In each Codex session: plan the finite ordered tasks; execute one approved slice; validate and record. At most one additional in-scope slice without human involvement if all gates pass. Never claim persistent/background execution; the session must remain active or be explicitly triggered by a separate runner.

## 7. Review and publication

Use a normal feature branch and non-force push only when specifically authorized. Open PR as draft for review; no automatic merging. Automated GitHub Actions may run CI but must not silently deploy or dispatch. A failed or missing CI signal remains a blocker, not an inferred PASS.

## 8. Done criterion

A slice is DONE only if exact approved acceptance criteria, tenant/security tests, documentation, validated local commit and an honest report all exist. Otherwise label it CONDITIONAL or BLOCKED, with exact evidence. Production/pilot release always requires separate explicit authorization.
