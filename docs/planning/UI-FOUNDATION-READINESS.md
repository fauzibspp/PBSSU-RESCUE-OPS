# UI Foundation Readiness

**Status:** UF-01A/B/C implementation is owner-authorized, but preflight is blocked by two mismatches between the approved OpenAPI contract and actual backend response shapes. No product UI implementation has started.
**Reviewed implementation base:** `origin/main` at
`6d7249b15aae43804feaf9bc0befaa4011f5d6a0` (Sprint 4 merge included).
**Sprint 4 PR:** #4 is merged; see the actual
[Pull Request](https://github.com/fauzibspp/PBSSU-RESCUE-OPS/pull/4).

## UF-01 contract preflight blockers

The owner has approved UF-01A, UF-01B and UF-01C and authorized local implementation. The implementation gate nevertheless fails because the authenticated client must consume approved existing contracts without inference or contract changes.

1. **MFA enrollment response:** OpenAPI `components.schemas.MfaEnrollment` requires `enrollment_id`, `expires_at`, `state`, `delivery_status`, `challenge`, and `setup_handoff`. The actual `IdentityService.startMfaEnrollment()` returns `enrollment_id`, a `handoff` object (`handoff_id`, `purpose`, `expires_at`), and `authentication_state`. These are incompatible response shapes. This blocks implementing the complete privileged TOTP enrollment flow in UF-01A. Other login, challenge verification, handoff redemption, refresh and revocation work must remain within their individually compatible contracts; no partial flow may imply enrollment was completed.

2. **Membership response:** OpenAPI `components.schemas.Membership` requires `id`, `version`, `created_at`, `organization_id`, `user_id`, `display_name`, `status`, `availability`, and `role_ids`. The actual `IdentityService.listMyMemberships()` returns `membership_id`, organization name/slug/status, display name, status, availability, and `roles` as `{code,name}` objects. The OpenAPI schema does not define the actual role-code projection. This blocks contract-compliant organization selection and role-aware navigation in UF-01B. Runtime role codes are not an approved contract fact for the browser client.

No OpenAPI or backend change is authorized by this preflight record. Resolve by approving and recording a bounded reconciliation of the existing operation response schemas to the actual approved service behavior (or an explicitly approved compatible service behavior), then revalidate the manifest. Do not add operations, roles, permissions, entities, or infer response fields.

The exact findings and evidence are recorded in [UF-01 preflight validation](../testing/UF-01-PREFLIGHT-VALIDATION.md).

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
