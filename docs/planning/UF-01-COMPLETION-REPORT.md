# UF-01 Secure Web Foundation Completion

**Assessment: CONDITIONAL PASS — accepted for local development review.**

## Baseline and scope

- Branch: `feat/uf-01-secure-web-foundation`.
- UF-01 implementation and acceptance commit:
  `046238660ddac1caf1a1b6758052cd427c1faed9`.
- Contract-reconciliation parent: `4beb37b92122c662a35b28f5e9d74a2050abbed8`.
- Approved base: `origin/main` at Sprint 4 merge `6d7249b15aae43804feaf9bc0befaa4011f5d6a0`.
- UF-01A/B/C are implemented under frozen manifest
  [`UF-01-SCOPE.v1.json`](UF-01-SCOPE.v1.json): seven web routes and ten
  existing API operations; zero new backend operations, permissions, roles,
  entities, or migrations.

## Delivered increments

### UF-01A — login, MFA and session

- Accessible login, TOTP verification, first-login TOTP enrollment, purpose-
  matched one-time setup handoff, session bootstrap/refresh, and session
  revocation/logout.
- Uses the approved server cookie/CSRF contract and in-memory challenge
  binding/setup material. No token, password, or TOTP secret is placed in web
  storage or URL parameters.
- Generic authentication failures do not echo backend details.

### UF-01B — application shell and organization selection

- Authenticated route boundary, selected organization control, membership role
  summaries, role-aware navigation display, and session controls.
- Client role codes affect navigation presentation only. The backend remains
  authoritative and platform administrators gain no implicit tenant access.
- Switching organizations clears incident state; stale tenant requests cannot
  repopulate the selected tenant view.

### UF-01C — read-only incidents

- Incident list and detail using only `listIncidents` and `getIncident`.
- Loading, empty, error, denied/not-found and session-required views; only
  contract-approved fields are rendered.
- No incident mutation, dispatch, assignment, location, movement, or reporting
  controls.

## Contract/security corrections

The preceding local contract commit `4beb37b92122c662a35b28f5e9d74a2050abbed8`
records the approved MFA enrollment and membership response schemas. This
implementation adds a narrow same-origin browser GET compatibility correction:
originless reads are accepted only with same-origin Fetch Metadata, a bound
session, and matching CSRF double-submit values. Cross-site requests and
cookie-authenticated writes still fail closed. The reason and affected
operations are recorded in the
[contract reconciliation](../api/UF-01-CONTRACT-RECONCILIATION.md).

## Validation and UX

Unit/contract 30/30, dedicated contract 12/12, guarded PostgreSQL integration
44/44, scope checks for Sprint 3-A/B/C and Sprint 4, lint, typecheck, API/web
builds, changed-file formatting, and headed Edge browser tests passed. The
browser suite reports 7 passed / 1 skipped (one-time enrollment is run once on
desktop); the enrollment flow separately passed in headed Edge. Actual
commands and limitations are in
[`UF-01-FINAL-ACCEPTANCE.md`](../testing/UF-01-FINAL-ACCEPTANCE.md).

Desktop and Pixel 7 emulation screenshots under ignored
`artifacts/browser/` were visually inspected. The UX is responsive and
readable for the bounded read-only flow. A complete accessibility audit was
not performed. Repository-wide `npm run format:check` still identifies nine
pre-existing unformatted files outside this change; every changed UF-01 file
passes targeted Prettier.

## Remaining gates

OpenAPI 3.1 full standards validation, production logging review, production
key management/rotation, backup/recovery ownership, M01-R01, Q-05, Q-06 and
Q-08 remain open. Browser session-expiry and every role permutation were not
fully exercised in browser automation; backend authorization tests remain
authoritative. No production deployment or operational use is authorized.

No push, merge, or deployment was performed. The two unrelated root
attachments remain untracked and unstaged.
