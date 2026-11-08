# Visual Development Workflow Validation

**Branch:** `chore/visual-development-workflow`

**Base:** accepted Sprint 4 commit `0b48f071f25c6a3f66314829d2973180ff6cfe9c`

**Validation date:** 2026-11-08

## Findings

- The accepted repository had no `apps/web` directory or React/Vite frontend.
- A development-only React preview was added. It explicitly states that
  operational screens and user workflows are not implemented.
- Microsoft Edge is installed and was used by Playwright for desktop and
  Pixel 7 viewport projects.
- The API process started and listened on `127.0.0.1:3301`. The preview's
  diagnostic verifies only a loopback TCP listener because no API health
  endpoint exists.
- Vite started on `http://127.0.0.1:5174`. Port 5173 was already occupied by
  a process identified as Docker Desktop's backend; that process/resource was
  left unchanged. `PBSSU_WEB_PORT` supports selecting another port.
- Docker CLI access was denied in this session. No Docker command changed
  containers, networks, volumes, or databases. Existing isolated synthetic
  PostgreSQL/PostGIS test databases remained available via their loopback
  forwarded ports. No Redis package, service, or configuration exists.
- The computer-use browser host was unavailable. A headed Playwright run
  nevertheless exercised Edge; screenshots were visually inspected from the
  generated artifacts.

## Commands and actual results

| Command                                                                                                                      | Result                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm install --save-dev --save-exact ...` (pinned React 19.3.1, Vite 8.3.6, React plugin 6.2.1, Playwright 1.65.0 and types) | PASS; 10 packages added, audit reported 0 vulnerabilities. npm blocked install scripts for existing `argon2` and `esbuild`; Vite build succeeded using the installed Windows binary.                                                 |
| `$env:PBSSU_WEB_PORT='5174'; npm run dev:web`                                                                                | PASS; Vite ready at `http://127.0.0.1:5174/`, loopback only.                                                                                                                                                                         |
| `npm run dev:api`                                                                                                            | PASS; listener observed on `127.0.0.1:3301`. This does not prove database health or endpoint health.                                                                                                                                 |
| `npm test -- --run`                                                                                                          | PASS; 2 files, 19 tests.                                                                                                                                                                                                             |
| `$env:PBSSU_TEST_DATABASE_STATE='.cache/sprint4a/database.json'; npm run test:integration`                                   | PASS; 6 files, 42 tests against the isolated Sprint 4-A synthetic database.                                                                                                                                                          |
| `$env:PBSSU_WEB_PORT='5174'; npm run test:browser:headed`                                                                    | PASS; 4 tests across desktop Edge and Pixel 7 Edge viewports. Assertions covered render, operational-scope disclosure, keyboard focus, responsive overflow, API diagnostic states, console errors, page errors, and failed requests. |
| `npm run typecheck`                                                                                                          | PASS; API and web.                                                                                                                                                                                                                   |
| `npm run lint`                                                                                                               | PASS.                                                                                                                                                                                                                                |
| `npm run build` and `npm run build:web`                                                                                      | PASS.                                                                                                                                                                                                                                |
| `npm run format:check` and `npx prettier --check docs/planning/VISUAL-DEVELOPMENT-WORKFLOW.md`                               | PASS.                                                                                                                                                                                                                                |
| `npm run scope:sprint3a`, `scope:sprint3b`, `scope:sprint3c`, `scope:sprint4a`                                               | PASS; approved operation/table inventories unchanged.                                                                                                                                                                                |

One initial integration run incorrectly applied the Sprint 3-D state file to
all test files, causing five schema/state mismatches. The rerun with the
Sprint 4-A state passed all 42 tests. A strengthened headed browser run found
a missing-favicon 404; a local SVG favicon was added, and the final headed
suite passed all four tests.

## Browser artifacts

- `artifacts/browser/desktop-edge.png` — final desktop screenshot.
- `artifacts/browser/mobile-edge.png` — final mobile viewport screenshot.
- `playwright-report/index.html` — generated HTML report.
- Playwright is configured to retain screenshots and traces on failures;
  videos are optional with `PBSSU_CAPTURE_VIDEO=1` and require Playwright's
  matching ffmpeg binary. No failure trace remains from the passing final run.

Artifacts are ignored by Git. Screenshots contain only synthetic developer
preview content.

## UI/UX assessment and limits

The preview rendered at desktop and mobile widths without horizontal overflow.
Keyboard focus is visible. Browser tests detected and drove correction of the
missing favicon. The status cards and scope notice fit the tested sizes.
There are no operational forms, navigation flows, loading/data-empty business
states, sign-in screens, dashboards, incident, assignment, or movement pages
to assess. No operational UI scenario is claimed as tested. Browser tests do
not replace API authentication, MFA, RBAC, tenant isolation, or database
integration tests.

## Remaining constraints

- Visible local preview: `http://127.0.0.1:5174/` in this session; 5173 was
  occupied. Use `PBSSU_WEB_PORT` to select a free loopback port.
- API integration suite requires a prepared isolated test-state file.
- Docker CLI was unavailable for new database setup; no new database was
  created in this task.
- The preview has no live API health endpoint, only a TCP listener indicator.
- No Redis service is configured.
- The native computer-use browser host could not be reached, so direct CUA
  inspection was unavailable; headed Edge screenshots and browser tests were
  produced and inspected.
