# UI Foundation Readiness Validation

**Date:** 2026-11-08
**Branch/base:** `chore/visual-development-workflow` at
`15735dd7249cdb6ef92545f7f21159c0c5bf881e` before this change.

## Baseline evidence

- Sprint 4 PR #4 is open, not merged, and GitHub reports it is not marked as a
  Draft. Its head is `0b48f071f25c6a3f66314829d2973180ff6cfe9c` and its base is
  `main` at `4d64be934497a4d004a9d1860bb3220a07450fee` at the time inspected.
  [PR #4](https://github.com/fauzibspp/PBSSU-RESCUE-OPS/pull/4) was not
  modified. The connected GitHub view returned no combined status checks or
  workflow run records; no CI status is claimed.
- The working tree initially contained only the two known unrelated,
  untracked root attachments. They were not edited, staged, or removed.
- `apps/web` currently contains only a React/Vite developer preview. No router,
  authentication UI, tenant shell, or incident screen exists.
- The frozen OpenAPI defines 75 operation IDs. Relevant existing operations
  include login, MFA verification, credential handoff, session refresh/revoke,
  current-user membership listing, and read-only incident list/detail.
- `listMyMemberships` returns role codes for the authenticated user's
  memberships. Those codes can guide displayed navigation only; authorization
  remains server-side.
- The API has no application health/readiness endpoint. The preview's current
  indicator reports only whether a TCP listener accepts loopback connections.
  No operational API scope was added.

## Changes and executed validation

| Command / check                                                                            | Result                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --run`                                                                        | PASS: 3 files, 27 tests, including eight synthetic integration-launcher state validation cases plus existing unit/contract tests.                                                              |
| `$env:PBSSU_TEST_DATABASE_STATE='.cache/sprint4a/database.json'; npm run test:integration` | PASS: read-only launcher preflight matched isolated loopback DB, PostgreSQL 18, PostGIS 3.7, 29 application tables, 54 permission keys and migrations 001–009; 6 files, 42 tests passed.       |
| `$env:PBSSU_TEST_DATABASE_STATE=$null; npm run test:integration`                           | PASS negative check: exited 1 before Vitest or database connection and requested an isolated state file; no credentials displayed.                                                             |
| `$env:PBSSU_WEB_PORT='5174'; npm run test:browser:headed`                                  | PASS: 4 Edge tests across desktop and Pixel 7 viewport projects; preview render, diagnostic states, keyboard focus, responsive overflow, console/page errors, failed requests and screenshots. |
| `npm run lint`                                                                             | PASS.                                                                                                                                                                                          |
| `npm run typecheck`                                                                        | PASS: API and web.                                                                                                                                                                             |
| `npm run build`                                                                            | PASS: API.                                                                                                                                                                                     |
| `npm run build:web`                                                                        | PASS: React/Vite production build.                                                                                                                                                             |
| `npm run format:check`                                                                     | PASS.                                                                                                                                                                                          |
| `npm run scope:sprint3a`, `scope:sprint3b`, `scope:sprint3c`, `scope:sprint4a`             | PASS: existing inventories unchanged; Sprint 4 check confirms 75 operation IDs and exact three-table/four-operation inventory.                                                                 |

The integration launcher requires `PBSSU_TEST_DATABASE_STATE`, confines it to
`.cache/sprint4a`, checks the pinned image and exact loopback database URLs,
then performs schema inventory queries within a read-only transaction. Only
after these checks does it start Vitest. It does not create, migrate, reset or
delete a database. Credential values are not included in validation output.

The launcher negative cases reject wrong scope, database, image, external host,
unexpected database role, short credentials, and a state file outside the
isolated cache. A no-state CLI run is also documented as fail-closed in the
launcher logic; no database operation begins in that path.

## Browser artifacts

The headed suite generated desktop and mobile screenshots under ignored
`artifacts/browser/`, and the Playwright HTML report under ignored
`playwright-report/`. Passing tests do not retain failure traces. Trace capture
is configured for future failures under `test-results/`. Screenshots contain
only the diagnostic preview and synthetic content.

## Limitations

- No operational UI scenario was executed because those screens do not exist.
- No real login/MFA browser flow was performed; browser coverage remains on the
  developer preview. The API integration suite is separate and retains its
  existing real HTTP auth/MFA coverage.
- No Nest health endpoint exists and no health route was added. TCP reachability
  must not be interpreted as API readiness.
- No dedicated OpenAPI standards-grade validator was run in this UI tooling
  task. Existing contract tests resolve local references and preserve operation
  inventory; no OpenAPI document was changed.
- No Docker, database lifecycle, API operational behavior, Sprint 4 backend,
  PR, remote branch, or deployment was changed.
