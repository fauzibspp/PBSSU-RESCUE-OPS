# Sprint 4 Preflight Validation

**Run date:** 2026-11-08
**Branch:** `feat/sprint-4-assignment-movement` (created from verified `origin/main`; no implementation started)
**Preflight source commits:** `ff9c187f0970004d5a48bd38f5641c359cf8f65e`, `a85910d4f10494481df47a845606115997bee5ed`
**Result:** **PASS — exact scope frozen; implementation may proceed within authorization**

## Owner decision and contract reconciliation

The Project Owner's 2026-11-08 S4-P-01 resolution is recorded in `DECISION-REGISTER.md`. `PersonnelAssignment.duty` is optional and nullable in OpenAPI output; existing string length constraints remain for non-null values. `AssignmentInput` remains unchanged, and the logical database field is nullable with no default or vocabulary. No duty is generated or inferred.

The frozen inventory is exactly three tables (`incident_personnel`, `incident_vehicles`, `movement_logs`) and four existing operations (`getAssignments`, `setAssignments`, `listMovements`, `createMovement`), with permission mappings G-04/G-06/G-07. The Technical Lead clarification defines post-DISPATCHED assignment intervals as active until a separately authorized future release workflow; Sprint 4 implements no release or terminal transitions.

## S4-P-02 owner approval and security resolution

The Project Owner explicitly approved global uniqueness on 2026-11-08: one active incident assignment per canonical `users.id` across all organizations. The assignment row is tenant-owned, binds `user_id` to the selected active membership with a composite FK, and uses database-level partial uniqueness on active rows. RLS/FORCE RLS remains enabled. Application code performs no cross-tenant availability lookup and maps the unique violation to a stable generic conflict that discloses no conflicting tenant or resource identity. Cross-tenant concurrent integration tests remain mandatory in Sprint 4-A/B.

## Checks executed

| Check | Command/evidence | Result |
| --- | --- | --- |
| Branch/worktree and attachments | `git status --short --branch`, `git rev-parse HEAD` | PASS; implementation branch is based on verified `origin/main`; only reviewed docs/contracts are modified; two root attachments remain untracked and untouched. |
| OpenAPI reference resolution | `npm exec vitest -- run apps/api/test/contract.test.ts -t "resolves every OpenAPI reference"` | PASS, 1 test. |
| JSON Schema 2020-12 compilation | `npm exec vitest -- run apps/api/test/contract.test.ts -t "compiles every OpenAPI 3.1 component schema as JSON Schema 2020-12"` | PASS, 1 test. This is component-schema validation, not full OpenAPI 3.1 standards validation. |
| Duty and request contract | `npm exec vitest -- run apps/api/test/contract.test.ts -t "keeps Sprint 4 duty optional"` | PASS, 1 test: output accepts omission/NULL and valid strings; rejects empty/wrong-type values; request rejects duty. |
| Fingerprint positive check | `npm exec vitest -- run apps/api/test/contract.test.ts -t "preserves all approved baseline fingerprints"` | PASS, 1 test after updating the AGENTS baseline hash and adding the Sprint 4 authorized contract-delta manifest. |
| Fingerprint negative fixture | `npm exec vitest -- run apps/api/test/contract.test.ts -t "rejects a changed synthetic file"` | PASS, 1 test; changed fixture content does not match the approved fingerprint. |
| Scope and contract inventory | `node scripts/tmp-s4-check.cjs` (temporary local checker, removed after execution) | PASS: 75 unique operations, exact three Sprint 4 tables/four existing operations, operation permission keys, optional nullable duty, unchanged AssignmentInput. |
| Final pre-freeze consistency | `node scripts/tmp-s4-prefreeze.cjs` (temporary checker, removed after execution) | PASS: exact 75 operation IDs, 3-table/4-operation inventory, permission keys, duty contract, lifecycle clarification, authorized contract-delta fingerprints and relative links. |
| Scope inventory and uniqueness design | inline Node structural checker (no persistent file) | PASS: 75 unique OpenAPI operations; exact 3 tables/4 existing operation IDs; G-04/G-06/G-07 permission parity; global canonical-user active uniqueness, membership binding, generic conflict semantics; optional nullable duty and no request duty. |
| Sprint 3 scope regressions | `npm run scope:sprint3a`; `npm run scope:sprint3b`; `npm run scope:sprint3c` | PASS, all three commands; 75 operation inventory and prior scope checks retained. |
| Full unit/contract suite | `npm test -- --run` | PASS: 19 tests passed across 2 files, including fingerprint positive/negative fixtures, OpenAPI references/schema compilation and duty contract. An earlier run failed because the fingerprint manifest was calculated without the test's CRLF normalization; the manifest was corrected using the test's exact algorithm and the final run passed. |
| Static checks | `npm run lint`; `npm run typecheck`; `npm run build`; `npm run format:check` | PASS for all four commands. |
| Secret scan | Node scan of `git diff --unified=0` for private-key headers, AWS-style access keys and assigned plaintext-password patterns | PASS; no matches. This targeted scan is not a general secret scanner. |
| Sensitive/local resource review | `git status --ignored --short`; changed-file and status review | PASS; ignored `.env`, `.cache/`, and `node_modules/` remain untouched and untracked; no credential/operational data files changed. The two supplied root attachments remain untracked. |
| Worktree scope | `git status --short --branch`; `git diff --cached --stat` | PASS; only reviewed Sprint 4 contract/docs changes are modified; no staged changes. The two root attachments remain untracked. |
| Whitespace | `git diff --check` | PASS; Git reports expected line-ending conversion warnings for edited files. |

## Fingerprint finding and safe correction

The original expected fingerprint was `e78c2320255ca01eeecb7f54aa46606f63ebfb62f90cd9135106741888d32159`; the current normalized fingerprint is `15729fd5ddb66d59735d8801511d2053f391371fccc164fc934c4b074eb95630`. Direct comparison showed the working file exactly matches the version introduced by authorized commit `f0a63c1594a108fa7c511b8087f86c7e25c42224`, whose only AGENTS change adds the non-overriding orchestrator reference. `git ls-files -v` reports uppercase `H` (not assume-unchanged); index blob `652880b0f379b27c115f896de2db266f8bbc0ccf` matches that commit, and working/cached diffs are empty. This was a stale expected fingerprint, not a hidden modification or normalization defect. The expected hash was updated in `FOUNDATION-FREEZE.json`; detailed provenance is in `AGENTS-FINGERPRINT-RECONCILIATION.md`. The integrity assertion remains active and has a negative synthetic fixture.

## Gate decision

**Preimplementation gate: PASS.** The owner-approved global uniqueness rule is represented as a database partial unique index over active canonical `users.id`, with same-tenant membership composite binding, no cross-tenant precheck, and generic conflict normalization. Exact operation/permission/table counts, optional-duty contract, lifecycle exclusions, tenant constraints, links, integrity guard, full unit/contract tests and static checks passed. Runtime database tests remain Sprint 4-A gates.

`SPRINT-4-SCOPE.v1.json` is **FROZEN** at exactly three tables and four existing operations. The feature branch is from verified `origin/main`; no Sprint 4 implementation has started. Sprint 4-A may begin under the owner’s conditional authorization.

## Limitations and open gates

- No full standards-aware OpenAPI validator was run.
- No database, migration, Docker, or runtime security integration tests were run; this was a preimplementation contract gate.
- M01-R01, Q-05, Q-06, Q-08, production KMS/logging, and the deferred Auditor cancellation-reason view remain OPEN.
- The two supplied root attachment files remain untracked and untouched.
