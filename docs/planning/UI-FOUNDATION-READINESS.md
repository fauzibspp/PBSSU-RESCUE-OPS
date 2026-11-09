# UI Foundation Readiness

**Status:** UF-01A/B/C owner-authorized scope is frozen after bounded response-contract reconciliation and passing preflight. Product UI implementation is now authorized within the manifest.
**Reviewed implementation base:** `origin/main` at
`6d7249b15aae43804feaf9bc0befaa4011f5d6a0` (Sprint 4 merge included).
**Sprint 4 PR:** #4 is merged; see the actual
[Pull Request](https://github.com/fauzibspp/PBSSU-RESCUE-OPS/pull/4).

## UF-01 response-contract reconciliation

The owner approved UF-01A/B/C and subsequently authorized a bounded reconciliation of the two response schemas. The OpenAPI was corrected to match the verified, security-reviewed service projections. Details and field-level compatibility are documented in [the reconciliation record](../api/UF-01-CONTRACT-RECONCILIATION.md).

1. **MFA enrollment:** `MfaEnrollment` now describes `enrollment_id`, purpose-bound `handoff`, and `authentication_state`. TOTP material remains available only through one-time handoff redemption. `startMfaReplacement` has a separate response schema for its combined challenge/enrollment response.

2. **Membership response:** `GET /me/memberships` now uses dedicated self-membership schemas matching the implementation, without changing shared administrative membership schemas. Role codes follow the existing stored code syntax. Navigation maps only approved Q-01 tenant templates; custom role codes receive no operational navigation and never authorize.

The authorized response corrections and HTTP status/cache-header alignment are recorded in [the reconciliation record](../api/UF-01-CONTRACT-RECONCILIATION.md). No operation, permission, role, or database entity was added.

## Current frontend

`apps/web` is a React 19 / TypeScript / Vite 8 workspace. It has one entry
component in `apps/web/src/main.tsx`, one stylesheet, and no router, product
layout, form library, application API client, or authentication state. The
existing page is a developer preview only. It makes a Vite development
middleware request to `__dev/api-status`, which attempts a loopback TCP
connection to port 3301. A successful TCP connection proves only that something
accepts connections; it does not establish Nest application health, database
readiness, authentication availability, or API correctness.

The API binds to loopback in the documented local setup. There is no health or
readiness operation in the frozen 75-operation OpenAPI contract. Do not add a
public API operation for this UI slice. The smallest compatible future
diagnostic is a dev-only, loopback-bound readiness probe outside OpenAPI that
returns only a generic ready/unavailable result after the Nest process starts
and a short bounded database connectivity check succeeds. It must not expose
dependency names, versions, tenant data, credentials, or raw errors. Keep the
existing Vite TCP indicator labeled as listener reachability, not health. This
probe is a recommendation only and is not implemented here.

## Contract readiness

Existing contracts support a proposed sign-in and read-only incident slice:

- `login`, `verifyMfa`, `redeemCredentialHandoff`, `refreshSession`, and
  `revokeSession` are the existing authentication operations.
- Web sessions use bound secure, HttpOnly cookies and the documented origin / CSRF
  controls. Do not persist access tokens, refresh tokens, MFA seeds or recovery
  codes in browser storage, URLs, logs, or screenshots.
- `listMyMemberships` is intended to provide the authenticated user's
  memberships, but the approved Membership response schema does not match the
  actual service projection. Do not build the organization selector or
  role-aware navigation against inferred response fields.
- `listIncidents` and `getIncident` are existing tenant-scoped, assurance-bound
  operations. They require `X-Organization-Id` as an untrusted selector and
  the exact operation permission. Server membership/RBAC checks remain
  authoritative.
- Incident schemas contain the approved `title`, `category`, `status`,
  `occurred_at`, `source_kind`, version and timestamps; outcome and cancellation
  reason are conditional. The first UI proposal omits cancellation reason and
  other sensitive fields entirely.

No frontend behavior currently integrates these contracts. The verified
`startMfaEnrollment` mismatch blocks the complete enrollment flow. The WEB
handoff and cookie design exists in the backend, but browser behavior still
requires real HTTP/browser validation after the contract blockers are resolved.

## Architecture and security gaps

| Area                 | Current state                                                              | Readiness gap                                                                                |
| -------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Routing              | One diagnostic React entry; no router                                      | Choose a small route strategy in implementation scope                                        |
| Authentication / MFA | Backend contracts and HTTP flows exist                                     | No browser login, challenge, TOTP, handoff, expiry or logout client                          |
| Tenant context       | Membership service returns the current user's memberships                  | Response schema mismatch blocks compliant membership consumption and tenant switching        |
| Authorization        | Backend exact permission checks exist                                      | Role-aware navigation awaits an approved Membership contract matching the service projection |
| API client           | Preview-only same-origin development probe                                 | No typed API client, cookie/CSRF wrapper, abort handling or error mapping                    |
| Session storage      | No web session implementation                                              | Use backend cookies; no token storage in local/session storage                               |
| Errors               | No product error boundary or user-facing request states                    | Define generic safe errors, retry and session-expiry handling                                |
| Accessibility        | Preview has visible keyboard focus and skip link                           | No product form semantics, screen-reader announcements or automated axe coverage             |
| Responsive UI        | Diagnostic preview has desktop/mobile viewport coverage                    | No product navigation or incident-list/detail responsive design                              |
| Browser tests        | Four preview scenarios were previously run on Edge desktop/mobile projects | No auth or operational UI tests exist                                                        |

Although the service currently returns role codes, those fields are absent from
the approved Membership response schema. The browser must not depend on them
until the contract is reconciled. It must never call role or permission catalogs
to infer grants; backend authorization remains authoritative.

## Proposed first vertical slice

See the versioned [UF-01 scope manifest](UF-01-SCOPE.v1.json) and
[browser acceptance matrix](../testing/UI-BROWSER-ACCEPTANCE-MATRIX.md).
The proposal is limited to login/MFA using existing contracts, a shell,
membership/tenant selection, role-aware navigation, read-only incident list and
detail, safe session expiry/logout, and synthetic Playwright tests. It adds no
backend contract, permission, incident field, or operational write action.

## Development diagnostics

The prior visual preview works without real operational data. It provides live
Vite reload and shows API TCP reachability explicitly as a listener diagnostic.
The integration launcher now requires an explicit state file in
`.cache/sprint4a`, validates loopback URLs and the pinned isolated database
identity, performs a read-only schema inventory check, and only then starts the
integration suite. It fails closed if the state file is absent, malformed,
external, or points to an unexpected schema. It does not create, migrate,
reset, or delete any database.

## GitHub integration readiness

PR #4 is merged. Its merge commit is `6d7249b15aae43804feaf9bc0befaa4011f5d6a0`,
which is the verified `origin/main` baseline for this UF-01 branch. At the time
of the integration check, PR metadata showed no submitted reviews and no CI
checks/workflow runs; those remain missing independent review evidence for the
Sprint 4 change. No PR metadata was modified.

Recommended bounded pull-request CI (proposal only):

1. Trigger on `pull_request` to `main`; grant only `contents: read`, with no
   deployment environment, production secrets, or write token.
2. Install the lockfile on a pinned Node 24 runner and run unit/contract tests,
   all existing scope checks, lint, typecheck, API build, and web build.
3. Run database integration in an ephemeral job with the pinned
   `postgis/postgis:18-3.7` digest from `infra/versions.json`, loopback-only
   binding, synthetic random credentials, no production secrets, and a unique
   `sprint4a` database/state file. Apply the existing migrations and run the
   guarded integration launcher; do not persist the database or credentials.
4. Publish only sanitized test summaries and synthetic browser screenshots.
   Never upload auth traces, headers, request bodies, database state files, or
   credentials. Do not use `pull_request_target` to execute untrusted code.
5. Require an independent human review and successful CI checks through
   repository branch-protection settings before merge. Those settings are not
   confirmed by the available PR metadata and must be checked by a maintainer.

This recommendation does not create or enable a workflow. The Sprint 4 PR
should first receive owner/reviewer assessment; do not merge it based solely on
GitHub's mergeable flag.
