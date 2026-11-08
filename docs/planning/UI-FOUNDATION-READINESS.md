# UI Foundation Readiness

**Status:** Ready to plan; operational UI implementation remains unauthorized.
**Reviewed branch/base:** `chore/visual-development-workflow` at
`15735dd7249cdb6ef92545f7f21159c0c5bf881e`.
**Sprint 4 PR:** #4, open, not merged, not marked Draft; see the actual
[Pull Request](https://github.com/fauzibspp/PBSSU-RESCUE-OPS/pull/4).

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
- `listMyMemberships` returns only the authenticated user's memberships and
  role codes. It can support an organization selector and role-aware navigation;
  role information is a presentation hint only. The API must authorize every
  request independently.
- `listIncidents` and `getIncident` are existing tenant-scoped, assurance-bound
  operations. They require `X-Organization-Id` as an untrusted selector and
  the exact operation permission. Server membership/RBAC checks remain
  authoritative.
- Incident schemas contain the approved `title`, `category`, `status`,
  `occurred_at`, `source_kind`, version and timestamps; outcome and cancellation
  reason are conditional. The first UI proposal omits cancellation reason and
  other sensitive fields entirely.

No frontend behavior currently integrates these contracts. Before an
implementation slice, confirm the WEB handoff response and cookie behavior in
the actual HTTP tests; do not assume the browser can read any credential
material.

## Architecture and security gaps

| Area                 | Current state                                                              | Readiness gap                                                                                 |
| -------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Routing              | One diagnostic React entry; no router                                      | Choose a small route strategy in implementation scope                                         |
| Authentication / MFA | Backend contracts and HTTP flows exist                                     | No browser login, challenge, TOTP, handoff, expiry or logout client                           |
| Tenant context       | Membership API exposes current user's tenant memberships                   | No selected-tenant state or tenant-switch invalidation                                        |
| Authorization        | Backend exact permission checks exist                                      | Navigation must be derived from returned role codes but never treated as security enforcement |
| API client           | Preview-only same-origin development probe                                 | No typed API client, cookie/CSRF wrapper, abort handling or error mapping                     |
| Session storage      | No web session implementation                                              | Use backend cookies; no token storage in local/session storage                                |
| Errors               | No product error boundary or user-facing request states                    | Define generic safe errors, retry and session-expiry handling                                 |
| Accessibility        | Preview has visible keyboard focus and skip link                           | No product form semantics, screen-reader announcements or automated axe coverage              |
| Responsive UI        | Diagnostic preview has desktop/mobile viewport coverage                    | No product navigation or incident-list/detail responsive design                               |
| Browser tests        | Four preview scenarios were previously run on Edge desktop/mobile projects | No auth or operational UI tests exist                                                         |

`listMyMemberships` does return role codes, but the UI should not call `listRoles`
or `listPermissions` to infer grants unless the approved contract and user
authorization explicitly permit it. Render only navigation affordances
associated with the selected membership; unauthorized API responses remain
the final authority.

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

PR #4 currently has no submitted reviews or inline review threads. GitHub
reports `mergeable: true`, but this is not a substitute for review or CI: its
combined status response contains no checks and its workflow-run lookup
contains no runs. The current PR base SHA is `4d64be934497a4d004a9d1860bb3220a07450fee`;
the accepted Sprint 4 head is not in `origin/main` while the PR is open.
No code or PR metadata was changed during this review.

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
