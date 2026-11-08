# Sprint 4 Preflight Validation

**Run date:** 2026-11-08
**Branch:** `feat/sprint-4-assignment-movement` (created from verified `origin/main`; no implementation started)
**Preflight source commit:** `ff9c187f0970004d5a48bd38f5641c359cf8f65e`
**Result:** **BLOCKED — scope is not frozen; do not implement Sprint 4-A**

## Owner decision and contract reconciliation

The Project Owner's 2026-11-08 S4-P-01 resolution is recorded in `DECISION-REGISTER.md`. `PersonnelAssignment.duty` is optional and nullable in OpenAPI output; existing string length constraints remain for non-null values. `AssignmentInput` remains unchanged, and the logical database field is nullable with no default or vocabulary. No duty is generated or inferred.

The proposed inventory remains three tables (`incident_personnel`, `incident_vehicles`, `movement_logs`) and four existing operations (`getAssignments`, `setAssignments`, `listMovements`, `createMovement`), with permission mappings G-04/G-06/G-07. It is not frozen. The Technical Lead clarification defines post-DISPATCHED assignment intervals as active until a separately authorized future release workflow; Sprint 4 implements no release or terminal transitions.

## Blocking operational ambiguity

The approved S4-P-02 rule says a responder may hold at most one active incident assignment, but does not specify whether the uniqueness is global across organizations or tenant-scoped. These are materially different operational policies for a person with memberships in multiple organizations and produce different database constraints and eligibility outcomes. The prior proposed global `users.id` interpretation is not sufficiently determined by the approved wording or logical schema; it is withdrawn as an assumption. **PENDING OWNER DECISION:** confirm global-per-user exclusivity or one-per-tenant exclusivity. Until then, assignment uniqueness design, concurrency acceptance tests, scope freeze, and all Sprint 4 implementation are blocked.

## Checks executed

| Check | Command/evidence | Result |
| --- | --- | --- |
| Branch/worktree and attachments | `git status --short --branch`, `git rev-parse HEAD` | PASS; correct planning branch/HEAD; the two root attachments remain untracked and untouched. |
| OpenAPI reference resolution | `npm exec vitest -- run apps/api/test/contract.test.ts -t "resolves every OpenAPI reference"` | PASS, 1 test. |
| JSON Schema 2020-12 compilation | `npm exec vitest -- run apps/api/test/contract.test.ts -t "compiles every OpenAPI 3.1 component schema as JSON Schema 2020-12"` | PASS, 1 test. This is component-schema validation, not full OpenAPI 3.1 standards validation. |
| Duty and request contract | `npm exec vitest -- run apps/api/test/contract.test.ts -t "keeps Sprint 4 duty optional"` | PASS, 1 test: output accepts omission/NULL and valid strings; rejects empty/wrong-type values; request rejects duty. |
| Fingerprint positive check | `npm exec vitest -- run apps/api/test/contract.test.ts -t "preserves all approved baseline fingerprints"` | PASS, 1 test after updating the AGENTS baseline hash and adding the Sprint 4 authorized contract-delta manifest. |
| Fingerprint negative fixture | `npm exec vitest -- run apps/api/test/contract.test.ts -t "rejects a changed synthetic file"` | PASS, 1 test; changed fixture content does not match the approved fingerprint. |
| Scope and contract inventory | `node scripts/tmp-s4-check.cjs` (temporary local checker, removed after execution) | PASS: 75 unique operations, exact three Sprint 4 tables/four existing operations, operation permission keys, optional nullable duty, unchanged AssignmentInput. |
| Final pre-freeze consistency | `node scripts/tmp-s4-prefreeze.cjs` (temporary checker, removed after execution) | PASS: exact 75 operation IDs, 3-table/4-operation inventory, permission keys, duty contract, lifecycle clarification, authorized contract-delta fingerprints and relative links. |
| Proposed inventory structural check | `node scripts/tmp-s4-frozen-check.cjs` (temporary checker, removed after execution; run before the ambiguity was recognized) | PASS as a structural check only: exact 3 tables/4 operations, OpenAPI IDs and permissions. It does not resolve the responder uniqueness policy and is not evidence of scope freeze. |
| Sprint 3 scope regressions | `npm run scope:sprint3a`; `npm run scope:sprint3b`; `npm run scope:sprint3c` | PASS, all three commands; 75 operation inventory and prior scope checks retained. |
| Full unit/contract suite | `npm test` | PASS: 19 tests passed across 2 files. |
| Static checks | `npm run lint`; `npm run typecheck`; `npm run build`; `npm run format:check` | PASS for all four commands. |
| Secret scan | `git diff --unified=0 | Select-String` for private-key headers, AWS-style access keys, and assigned plaintext password patterns | PASS; no matches in additions. This targeted scan is not a general secret scanner. |
| Sensitive/local resource review | `git status --ignored --short`; changed-file review | PASS; no credential or operational records added. Existing ignored `.env`, `.cache/`, `node_modules/`, and build output were not staged or cleaned. |
| Worktree scope | `git status --short --branch`; `git diff --cached --stat` | PASS; only reviewed contract/docs/test changes are tracked modifications; no staged changes. The two root attachments remain untracked. |
| Whitespace | `git diff --check` | PASS; Git reports expected line-ending conversion warnings for edited files. |

## Fingerprint finding and safe correction

The original expected fingerprint was `e78c2320255ca01eeecb7f54aa46606f63ebfb62f90cd9135106741888d32159`; the current normalized fingerprint is `15729fd5ddb66d59735d8801511d2053f391371fccc164fc934c4b074eb95630`. Direct comparison showed the working file exactly matches the version introduced by authorized commit `f0a63c1594a108fa7c511b8087f86c7e25c42224`, whose only AGENTS change adds the non-overriding orchestrator reference. `git ls-files -v` reports uppercase `H` (not assume-unchanged); index blob `652880b0f379b27c115f896de2db266f8bbc0ccf` matches that commit, and working/cached diffs are empty. This was a stale expected fingerprint, not a hidden modification or normalization defect. The expected hash was updated in `FOUNDATION-FREEZE.json`; detailed provenance is in `AGENTS-FINGERPRINT-RECONCILIATION.md`. The integrity assertion remains active and has a negative synthetic fixture.

## Gate decision

**Preimplementation gate: BLOCKED.** Fingerprint integrity now passes with the authorized baseline update and negative fixture. The Technical Lead clarification resolves post-DISPATCHED assignment disposition without automatic release. However, S4-P-02 does not settle whether responder uniqueness is global or tenant-scoped. The structural/contract checks cannot answer that operational question.

`SPRINT-4-SCOPE.v1.json` is **BLOCKED / NOT FROZEN**. The proposed inventory remains exactly three tables and four existing operations, but assignment eligibility, uniqueness constraints, and concurrency acceptance tests cannot be finalized until the owner decides the responder uniqueness scope. The feature branch was created from verified `origin/main` and contains only the reviewed contract artifacts; no Sprint 4 implementation has started.

## Limitations and open gates

- No full standards-aware OpenAPI validator was run.
- No database, migration, Docker, or runtime security integration tests were run; this was a preimplementation contract gate.
- M01-R01, Q-05, Q-06, Q-08, production KMS/logging, and the deferred Auditor cancellation-reason view remain OPEN.
- The two supplied root attachment files remain untracked and untouched.
