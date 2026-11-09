# CI-01 Secure Quality Gates — Recovery and Validation

- **Date:** 2026-11-09
- **Branch:** `feat/uf-01-secure-web-foundation`
- **Baseline / current HEAD:** `2524d43f5521a6d2200041d8e06674aa3d3a026f`
  **Status:** **LOCAL VALIDATION PASS — GitHub execution pending.**

## Scope and repository state

CI-01 hardens required authenticated browser-test execution, adds result-count
enforcement, provides synthetic fixture validation and cleanup, improves the
loopback API test launcher, adds focused test-harness coverage, and prepares a
PR-only GitHub Actions workflow. No API operation, permission, database entity,
operational UI behavior, or historical migration changed. No push or PR update
was performed. The two root attachments and two existing local PR review
documents remain untracked and were not staged.

The current local commit remains the accepted UF-01 baseline above. CI-01 work
is uncommitted pending final review and local acceptance commit. The remote
`origin/main` is `6d7249b15aae43804feaf9bc0befaa4011f5d6a0`; the accepted UF-01
HEAD is the expected baseline, and the approved Sprint 3 baseline is an
ancestor of `origin/main`.

## Integration failures investigated

| Failure                                  | Evidence and root cause                                                                                                                                                                                                                                         | Resolution / confidence                                                                                                                                                                                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reused-state integration setup collision | A prior run failed in `apps/api/test/database.integration.test.ts:78`: the fixed synthetic organization slug `m01-alpha` already existed (`organizations_slug_key`). Setup failed before the suite ran, leaving 11 tests skipped.                               | Use newly provisioned isolated databases for verification. The full suite passed twice on separate fresh states. The fixed fixture is not safe for repeatedly reusing a populated state; do not treat that reuse failure as a product regression.                                  |
| Role cleanup foreign-key failure         | An earlier truncated run reported a `role_permissions_organization_id_role_id_fkey` violation during M01 cleanup. The exact complete stack and all fixture state were not retained.                                                                             | Not reproduced on any of the three fresh isolated database runs (44/44 each). Evidence is insufficient to attribute it conclusively to a specific teardown ordering defect; no FK or cascade behavior was weakened.                                                                |
| TOTP fresh-step timeout                  | An earlier truncated run timed out in `"issues a session handoff only after a fresh valid TOTP proof"` at `apps/api/test/identity.http.integration.test.ts:404`. The run overlapped browser work, but contention is only a possible factor, not a proven cause. | Not reproduced in any subsequent full fresh-database run. No arbitrary sleep, clock override, or timeout increase was introduced. The original output did not preserve the third failure identity/stack, so no claim is made that all prior failure causes are definitively known. |

## Test-assertion review

In `apps/api/test/sprint4a-database.integration.test.ts`, the cross-tenant
write assertion originally updated `duty`, a column the restricted runtime role
cannot update. That could fail at column privilege checking before testing the
intended row-level security behavior. It now attempts to update `released_at`,
an allowed column, and asserts zero affected rows for the other tenant's row.
This retains and sharpens the RLS-hidden-write assertion.

A separate assertion originally expected `P0001` while attempting to update
the protected `duty` column. The actual restricted-role behavior is PostgreSQL
`42501` (insufficient privilege), so that assertion now checks `42501`. The
following allowed-column update still checks the append-only trigger's
`P0001` rejection. Thus both privilege denial and trigger enforcement remain
covered; neither assertion was changed to accept a mutation.

## Database provisioning and migration evidence

The existing guarded `npm run db:sprint4a` provisioner created two unique,
loopback-only disposable PostGIS containers with temporary database storage and
unique state files:

- `.cache/sprint4a/1061324a0860.json`
- `.cache/sprint4a/c740f1ffb7ff.json`

Both resources are isolated and were left intact; no existing Docker resource
was removed or modified. Each was verified by `npm run db:migrate:sprint4a`:
fresh and repeat migration succeeded on PostgreSQL 18.6 / PostGIS 3.7.0;
migrations 001–009 were present; inventory was 29 application tables and 54
permission keys; RLS and FORCE RLS were enabled on the three Sprint 4 tables;
tenant policies and runtime-role update/delete denials for movement history
were verified. The guarded integration launcher passed **44/44 tests across
six files** on each of the two fresh states.

The earlier reuse-state slug collision demonstrates why these fresh state
identities are required. No production connection or real data was used.

A third fresh database was provisioned for final verification:
`.cache/sprint4a/410276a165ed.json`. Fresh/repeat migrations passed with the same
29-table, 54-permission, 001–009, PostgreSQL/PostGIS, RLS/FORCE RLS, and
restricted runtime-role checks. Its guarded integration suite passed **44/44**
across six files. The state file and its uniquely owned Docker resources remain
intact; nothing was reset or removed.

## Browser fixture and required-suite enforcement

- Missing `PBSSU_TEST_DATABASE_STATE` negative test: **PASS**. The required
  acceptance command exited nonzero with `Required browser acceptance needs
PBSSU_TEST_DATABASE_STATE` and did not start Vite, using the preflight-only
  mode.
- Invalid synthetic state negative test: **PASS**. The command exited nonzero
  with the generic message `Browser acceptance requires a valid isolated
synthetic Sprint 4-A database state`. The temporary invalid state file was
  removed after the check.
- Browser result checker unit coverage: **PASS**, including reduced test count,
  skipped tests, unexpected/flaky tests, malformed report and invalid minimum.
- Optional preview: **4/4 passed** across desktop and mobile Microsoft Edge.
- Authenticated acceptance: **6/6 passed twice**, on desktop and mobile Edge,
  with zero skips, unexpected tests, or flaky retries. Covered login/MFA,
  tenant switching, read-only incidents, logout, platform-only denial and
  first-login TOTP enrollment.
- Final report gate: `node --import tsx scripts/check-browser-results.ts 6`
  **PASS**. The generated browser fixture was absent after teardown.

The first authenticated browser attempt failed 6/6 because the launcher ran
source TypeScript through `tsx`, leaving Nest constructor injection metadata
unavailable in that launch path (`IdentityController.login` received an
undefined service and returned HTTP 500). The launcher now builds/runs the
compiled Nest entrypoint and waits for an IPC readiness signal plus the
expected unauthenticated HTTP 401 on `/incidents`. Authenticated acceptance
then passed twice. Normal API startup does not send the IPC message.

Fixture values use synthetic `example.invalid` identities. Fixture creation
uses restrictive permissions and exclusive creation; normal teardown and
best-effort interruption handlers remove it. Abrupt termination may prevent
cleanup. Credential-bearing acceptance traces, screenshots and videos are
disabled. A heuristic marker scan found no credential markers in generated
browser artifacts; this is not a dedicated secret scan.

Screenshots were visually reviewed: desktop login rendered cleanly; the Pixel
7 authenticated incident view remained readable without horizontal overflow.
Only synthetic content was displayed.

## CI workflow review

`.github/workflows/ci-01-quality-gates.yml` is a local proposal, not published.
It is pull-request-only, grants `contents: read`, pins actions to reviewed
commit SHAs, uses no production credentials or deploy permissions, and
contains scope/OpenAPI, formatting/lint/typecheck/build/unit, isolated
PostgreSQL/PostGIS plus restricted-role integration, required Edge browser,
and Gitleaks jobs. It uploads no browser artifacts. The browser job builds the
API before starting the compiled real HTTP server. A preflight-only negative
step checks missing-state fail-closed behavior.

| Workflow check                                    | Result                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| YAML syntax/format parse                          | PASS via Prettier YAML parser and format check                                  |
| GitHub Actions semantic validation (`actionlint`) | PASS — v1.7.12, downloaded from the official release and SHA-256 verified       |
| Workflow execution on GitHub                      | NOT EXECUTED; workflow was not published and no push/PR update is authorized    |
| Dedicated Gitleaks history scan                   | PASS — v8.24.3, official archive checksum verified; 9 outgoing commits scanned  |
| Working-tree CI-01 file scan                      | PASS — changed CI-01 files scanned individually; no findings                    |
| Reviewed Gitleaks false positive                  | Exact historical fingerprint allowlisted; SHA-256 provenance verified below     |
| Standards-aware OpenAPI validation                | PASS using cached Redocly CLI 1.34.5; one non-blocking license metadata warning |

The workflow's hosted-runner behavior, pinned image pull, browser installation,
and GitHub permissions have not been proven by a GitHub run. Actionlint v1.7.12
reported no workflow issues. No workflow execution result is claimed.

### Gitleaks finding disposition

The unfiltered `origin/main..HEAD` history scan examined nine commits and
reported one `generic-api-key` finding at
`docs/testing/UF-01-CONTRACT-DELTA.json:7`, commit
`4beb37b92122c662a35b28f5e9d74a2050abbed8`. The three values in the manifest
are SHA-256 content digests. A Git-object verification recomputed each digest
from the referenced OpenAPI, traceability, and test-strategy blobs at that
commit; all three matched. No credential or secret value was present.

`.gitleaksignore` contains only the finding's exact commit/path/rule/line
fingerprint with this rationale. It does not suppress other lines, rules,
paths, or commits. The outgoing-history scan was rerun with this disposition
and reported no leaks. The uncommitted CI-01 file scan also reported no leaks.
The fingerprint disposition is reviewable and does not add a broad allowlist.

## Executed local quality results

| Check                                            | Result                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Unit/contract suite                              | PASS — **40 tests** across the current unit suite                                   |
| Guarded PostgreSQL integration                   | PASS — **44/44**, three times on distinct fresh isolated databases                  |
| Fresh and repeat migration/inventory             | PASS — three times; 29 tables, 54 permissions, migrations 001–009                   |
| Authenticated Edge acceptance                    | PASS — **6/6**, twice; zero skips/unexpected/flaky                                  |
| Optional Edge preview                            | PASS — **4/4** desktop/mobile                                                       |
| Missing-state and invalid-state negative checks  | PASS — both fail closed with expected generic errors                                |
| API and web typecheck                            | PASS                                                                                |
| API and web builds                               | PASS                                                                                |
| Lint and format checks                           | PASS                                                                                |
| Sprint 3-A/B/C and Sprint 4-A scope checks       | PASS — 75-operation contract and frozen Sprint 4 inventory retained                 |
| OpenAPI references/Redocly lint                  | PASS with one non-blocking license warning                                          |
| Workflow syntax and actionlint                   | PASS — Prettier YAML parse and actionlint v1.7.12                                   |
| `git diff --check`                               | PASS; Git reports line-ending normalization warnings for one edited TypeScript file |
| Dedicated outgoing-history and working-tree scan | PASS — Gitleaks v8.24.3; one exact, verified digest false positive disposition      |
| GitHub Actions CI                                | NOT EXECUTED                                                                        |

## Changed files

- `.gitleaksignore` (one fingerprint-specific, provenance-verified false positive)
- `.github/workflows/ci-01-quality-gates.yml`
- `apps/api/src/main.ts`
- `apps/api/test/browser-fixture.test.ts`
- `apps/api/test/browser-results.test.ts`
- `apps/api/test/sprint4a-database.integration.test.ts`
- `package.json`
- `playwright.config.ts`
- `scripts/check-browser-results.ts`
- `scripts/run-browser-api.ts`
- `tests/browser/fixture.ts`
- `tests/browser/global-setup.ts`
- `tests/browser/uf01.spec.ts`
- `docs/testing/CI-01-READINESS-VALIDATION.md`

The lockfile did not change. Unrelated untracked root attachments and local PR
review documents are excluded from the CI-01 change set.

## Remaining gates and recommendation

CI-01 local validation gates pass. The three clean database runs each passed
44/44 integration tests, and two prior authenticated browser runs passed 6/6
with zero skips. A final browser launch against the third database was
attempted but could not start: the sandbox and escalated process launcher
returned access denied while accessing the local Docker-backed service. This
was an environment launch failure, not a browser test result; no third-run
browser PASS is claimed. The two earlier full browser runs remain the actual
browser evidence.

The exact Gitleaks finding was independently proven to be content digests and
was dispositioned by one fingerprint-specific ignore entry; both history and
uncommitted CI-01 scans then passed. Actionlint v1.7.12 passed. A local
acceptance commit is now appropriate under the owner's stated gate, subject to
the final changed-file review and scoped staging. GitHub Actions execution
remains pending and must be verified after separately authorized publication.
Do not label CI-01 end-to-end PASS or PR #5 CI-validated until that run succeeds.
