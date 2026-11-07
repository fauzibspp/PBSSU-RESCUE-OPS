# Test strategy

PBSSU-TEST-001 v0.1. All T-* cases below are planned acceptance tests, not executed application tests. M00 executes documentation checks only, recorded in [validation](M00-VALIDATION.md).

## Layers and environments

Unit tests cover permission predicates, transition guards, version/hash logic and redaction. PostgreSQL/PostGIS integration tests run migrations and actual RLS under the runtime role (never only mocks or owner credentials), exercising pooled connections and concurrency. Contract tests validate DTOs/responses against OpenAPI 3.1. Backend end-to-end tests cover authorized and denied flows. React component/accessibility tests and Flutter unit/widget/device tests cover user-visible states. Device integration tests use restart, airplane mode, clock skew and tenant switching. iOS build/device evidence requires macOS/Xcode access.

All data is synthetic: two tenants, a multi-tenant user with different roles, revoked member, platform administrator with no operational grant, three invented responders, six invented location labels and no real contacts/banking information. Test teardown affects disposable databases only. No production access or externally delivered messages.

## Requirement acceptance suites

| Test ID | Required assertions |
| --- | --- |
| T-001 | Atomic organization/admin onboarding, duplicate slug, platform metadata-only access. |
| T-002 | Login/refresh/reuse/revoke, brute-force throttling and account enumeration resistance. |
| T-003 | Membership selection, differing tenant roles, revoked membership and cache isolation. |
| T-004 | Tenant role grant bounds and cross-tenant role/member denial. |
| T-005 | Personnel private-field projection and authorized profile change. |
| T-006 | Tenant-unique vehicle call sign, retirement/history preservation. |
| T-007 | Q-02 lifecycle edge matrix; Sprint 3 accepts DRAFT→OPEN and Commander cancellation only from DRAFT/OPEN with reason; reject unsupported and Sprint 4-dependent edges; enforce role grants, base_version, `STALE_VERSION`/`INVALID_TRANSITION`/`PREREQUISITE_UNAVAILABLE`, atomic single version increment, event+audit commit, and no mutation on conflict. |
| T-008 | Parallel report allocation per org/year, year boundary in MYT, shared reference across revisions. |
| T-009 | Multiple location records; explicit parent incident base_version and one atomic parent version increment; same-tenant/wrong-incident and foreign-tenant FK rejection; stable stale-version response; atomic redacted event/audit. |
| T-010 | Manual assignments only, active resource validation, no external dispatch. |
| T-011 | Append-only movement corrections, assigned-vehicle check, occurred vs received time. |
| T-012 | Observation/risk validation, assigned-incident scope, immutable correction lineage. |
| T-013 | Optional GPS, invalid coordinate pair/range, media checksum/type/size/malware, quarantine and cross-tenant download denial. |
| T-014 | Encrypted outbox survives restart/offline; account/tenant partitions; local pending label. |
| T-015 | Concurrent/repeated sync produces one mutation; altered payload same key conflicts; receipt and mutation atomic. |
| T-016 | Stale version and dependency ordering; tombstones, cursor expiry, scope loss and safe resnapshot preserve local work. |
| T-017 | Only commander closes COMPLETED after review; COMPLETED requires nonempty outcome; cancellation only from DRAFT/OPEN with reason; CLOSED/CANCELLED cannot reopen in MVP; report state stays independent; verify reason projection (full for authorized Commander/Operator, omitted for responder/admin/platform, auditor view deferred), unauthorized errors/notifications/logs redact it. |
| T-018 | Required report sections/provenance and missing-data honesty; sanitized six-location scenario. |
| T-019 | Submit freezes snapshot, self-approval blocked, reject reason, immutable approved version, correction creates revision, approval race single winner. |
| T-020 | Approved-only PDF/text, redaction and exact revision digest, no automated sending/acknowledgement claim. |
| T-021 | Tenant dashboard/map filtering, role visibility and stale/offline states. |
| T-023 | Staged ONBOARDING/FIRST_ADMIN, one-time invite acceptance, verified-recipient binding, intended-role MFA, atomic activation/delegation recheck and no pending/inactive/foreign-tenant activation. |
| T-024 | Bound purpose/version/nonce challenges; MFA/TOTP/code replay, replacement, reset preserving MFA, refresh ancestor reuse/races/absolute expiry and expired-access logout. |
| T-026 | One-time handoff purpose/subject/client/version/expiry, completed-auth/MFA guards, web-cookie/native custom-media separation, replay/response-loss/refresh races, encrypted-material purge and no capture in APM/proxy/log/audit; synthetic-only authorized local mock mailbox, zero outbound/fallback, production sender disabled. |
| T-025 | Traverse every identity success/error/page/header projection; no generic secret/hash/seed/URI/code-list/token/redirect echoes or logging/audit payloads; only the isolated C-02 handoff may release material, unavailable adapter denies. |
| T-022 | Successful mutation audit atomicity; denied-action trail; sensitive reads/exports; append-only audit/event records and correction-by-new-event; cancellation reason access only by approved projection; no reason in generic logs/public telemetry/unauthorized notifications/errors; auditor full reason only after a separately approved authorized audit view exists. |

Sprint 3-B execution adds restricted-role PostgreSQL coverage for exact incident permission catalog keys/scopes/grants, onboarding template mapping, incident CRUD commands, optimistic concurrency races, staged lifecycle guard codes, cross-tenant denial, ciphertext-only cancellation metadata, rejection of arbitrary metadata, immutable audit writes, and rollback when encryption key loading fails. Generic list/get do not decrypt cancellation metadata; the authorized reason retrieval projection remains deferred. These are implementation checks, not proof of production key management or deployment recovery.

## Non-functional/security suites

| ID | Gate |
| --- | --- |
| T-N01 | Per-operation cross-tenant negative matrix: list/get/write/nested IDs/header/body spoof/raw SQL/workers/cache/media/export/sync; runtime role cannot bypass RLS, missing context denies; pool and concurrent tenant requests remain isolated. |
| T-N02 | HTTPS/session/MFA policy, CSRF/CORS, recovery and privileged role escalation checks. |
| T-N03 | Device/media/export privacy, secrets/key access, log redaction and minimized field projection. |
| T-N04 | Interrupted push/pull/DB crash receipts, retry/replay horizon and queue recovery. |
| T-N05 | Backup restoration and integrity checks; measure actual RPO/RTO against approved targets. |
| T-N06 | BM language, screen reader/keyboard/text scaling/color-independent status and field usability; proposed web WCAG 2.2 AA checks. |
| T-N07 | Measure proposed p95 API limits with agreed 50-concurrent-user/10-tenant/100k-incident fixture; separate upload/render budgets. |
| T-N08 | Availability instrumentation, failure injection, health probes and alert runbook exercise; no retrospective uptime claim without measurements. |
| T-N09 | Reproducible build, lint/type check, migration/RLS inventory, dependency/secret checks and OpenAPI conformance. |
| T-N10 | Correlation/metrics/audit redaction and actionable failure alerts with no cross-tenant labels exposing content; prove cancellation reason never enters generic logs, public telemetry or unauthorized notifications. |

## Release gates and evidence

Each feature must link requirement → operation/entity → named test → execution result. Store command, environment, date, counts and failure details; never label a planned test passed. CI adds lint/type checks, unit/integration/contract tests and frontend/mobile checks as applications exist. Migration verification includes fresh DB and upgrade from prior approved schema. API security matrix must grow with each endpoint.

Pilot gate: all required tests executed, no unresolved critical/high tenant or privacy vulnerabilities, medium residual risk accepted by named owners, restore exercise completed, approved data/operational policies and UAT sign-off. Production deployment remains separately authorized.

## M00.1 planned foundation extensions

T-003/T-004/T-N01 must include every exact permission key, role/scope combination, self-grant/custom-role widening, default platform denial, mixed-tenant session/worker/cache/pool cases and sync's underlying permission checks from the [authorization model](../security/AUTHORIZATION-MODEL.md). T-002/T-N02/T-N03 add invitation/verification, MFA enrollment/replay/step-up, one-time recovery codes, no MFA reset by email, consumed refresh ancestor reuse, expired-access logout and authoritative session revocation from the [authentication architecture](../security/AUTHENTICATION-ARCHITECTURE.md). T-N09 includes explicit SQL migration and runtime credential inventory; T-N01 includes max-one pool alternation and failed transactions. These are planned extensions, not executed application-test results. Runtime version/library checks follow the [compatibility gates](../architecture/FOUNDATION-COMPATIBILITY.md).

## M00.2 scope and limits

Historical M00.2 aligned OpenAPI0.2.0/74 operations/39 entities; current approved OpenAPI0.3.0/75 operations/40 entities supersedes that candidate, still without application code. [Identity lifecycle](../api/IDENTITY-LIFECYCLE.md) defines SEC-ID-01–06 and declarative state guards. Structural schema fixtures, permission coverage, relationship inventory and state-catalogue checks do not execute guards/RLS/MFA. C-02 is explicitly resolved through the dedicated handoff; implement/test no generic credential delivery and no mock-mail/MFA bypass. All T-001–025/T-N01–10 suites remain planned runtime tests.

## Approved baseline verification boundary (2026-11-07)

Q-01/Q-03/Q-04/C-02 approval is [owner evidence](../planning/STAKEHOLDER-APPROVAL-2026-11-07.md), not a passed test. Current contract: 75 operations, 40 logical entities and 26 identity capabilities. Secret-free recursive checks apply to every generic success/error schema; a separate explicit allowlist permits sensitive custom-media schemas only at redeemCredentialHandoff. Verify no generic application/json fallback or sensitive example values, while the isolated 204 web branch declares protected cookies. Model fixtures cannot establish runtime crypto, atomics, CSRF/native storage, scanner/provider or no-network behavior. M01 tests must use synthetic identities and controlled mock delivery with no real outbound messages, never bypasses. Production delivery is not authorized.
