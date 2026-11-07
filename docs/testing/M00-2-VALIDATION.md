# M00.2 contract and logical foundation validation

PBSSU-VAL-003 v0.2, 2026-11-06. Documentation/contract checks only. Historical [M00](M00-VALIDATION.md) and [M00.1](M00-1-VALIDATION.md) counts remain prior evidence, not newly executed runtime tests.

## Scope and candidate outcome

Read repository instructions, blueprint and M00/M00.1 foundation package. OpenAPI0.2.0 now has login challenge/session metadata alternatives, MFA enrollment/proof/recovery/replacement, invite accept/activate/revoke, verification/reset/change and session management. createMembership immediate activation is removed. Current logical schema/dictionary have 39 entities, exact permission/scopes and identity audit separation; 74 operation keys are reconciled with requirements/test plans.

C-01 is STRUCTURALLY ALIGNED CANDIDATE. Q-01/Q-03/Q-04 remain PENDING STAKEHOLDER APPROVAL. C-02 is BLOCKING: no permission was inferred to return credentials through JSON, redirect or response headers. The schema exposes metadata only and issuance/provisioning must fail closed pending explicit delivery/provisioning policy. This is a review freeze, not end-to-end readiness.

## Execution evidence

Executed inline Python/jsonschema checks with bytecode writes disabled: PASS, 12,514 assertions/schema checks, process exit 0. No validators/dependencies installed. The checks covered 38 Markdown files, 103 local links, 791 local OpenAPI references, 103 Draft202012 schemas, 74 operation IDs across 61 paths, six role templates and all 25 identity capability keys. Domain counts: 47 TENANT, two PLATFORM, 12 IDENTITY_SELF, three CREDENTIAL_ENTRY, three ACTION_PROOF, six BOUND_CHALLENGE and one SESSION_REFRESH.

All 39 schema/dictionary/relation-inventory entities matched ERD node names. All 54 identity/foundation/root FK records matched existing referenced unique tuples, tenant prefixes and nullable-component rules. Seven identity lifecycle machines matched the readable transition table; terminal states had no outgoing edges, no PENDING→ACTIVATED invite shortcut existed, and only activateInvitation led a membership to ACTIVE. These are declarative catalogue/relationship checks, not executed SQL or authentication behavior.

All 45 synthetic JSON Schema fixtures produced their expected acceptance/rejection outcome. Positive fixtures included challenge/session metadata, staged onboarding, empty-grant pending membership, invite input/acceptance, MFA metadata/code input, reset DTO, scoped role grant and session summary. Negative fixtures rejected injected access/refresh/seed/otpauth/hash fields, malformed challenge/session branch, missing client binding, client tenant/user injection, ACTIVE onboarding root, MEMBER first-admin invitation, nonempty role grants on pending membership, administrative PATCH ACTIVE/PENDING_ACTIVATION, empty invite role set, short reset password, disable_mfa injection, enumeration flag, unscoped/PLATFORM grants, pending activation success, invalid TOTP shape, live change without record and export recipient injection. Fixtures are documentation-schema checks, not runtime security tests or actual credentials.

Recursive request/response checks confirmed closed DTOs, request-only sensitive markers, no reachable identity-secret properties/writeOnly schemas in response projections, no declared credential/redirect response headers, bound-challenge security, no anonymous refresh fallback and access-or-refresh logout. All 74 keys had exact permission/requirement/entity/test mappings; FR-001–022, NFR-001–010 and SEC-ID-01–06 coverage was checked. Catalogue tests also confirmed no platform tenant grants or default approval grants outside Commander.

All 22 raw-file SHA-256 fingerprints in the candidate freeze matched, with Q-01/Q-03/Q-04 pending and C-02 blocking. All 40 working-tree document files (including pre-existing M00/M00.1 changes) were Markdown/JSON under docs or the pre-existing root README change, newline-terminated and free of trailing whitespace. git diff --check exited 0. No application scaffolding, installed artifacts or service changes are represented. New M00.2 artifacts: five; updated documentation/contract files in this task: eighteen.

Model checks cannot establish actual serializer sanitization, entropy, proof checking, authorization predicates, CSRF/native transport, database RLS/constraints or replay/concurrency enforcement. No app lint/type/build/test result is claimed. The frozen source-reviewed toolchain is not runtime-verified. Candidate hashes are review fingerprints, not signatures or stakeholder approvals.

Final follow-up check also exited 0/PASS: reverified all 22 freeze fingerprints after report updates, confirmed the proposed M01 inventory contains exactly 39 distinct existing operation keys and 21 distinct logical foundation tables, and checked final report/ADR-register links and whitespace. git diff --check exited 0 again. No application/runtime test was run.

## Limitations and unresolved risks

- Full OpenAPI standards validation/code generation, rendered Mermaid QA, runtime database migrations/RLS/pool/concurrency, auth/session/MFA security, mobile delivery/native behavior, dependency/peer/image compatibility, lint/type/app tests and load benchmarks were not run.
- Removing credential fields is not a usable credential handoff. C-02 is unresolved and must be approved/contracted before application identity code or live credential issuance. Do not encode a secret into an allegedly safe field, silently allow Set-Cookie or treat mail dispatch as verified receipt.
- TOTP seeds/codes require an approved independent authenticated provisioning process; email-only password reset must not bypass MFA. Manual all-factor recovery remains unavailable until custody/evidence policy approval.
- Source-reviewed M00.1 toolchain evidence is retained as dated evidence; no new latest-version/compatibility claim. Exact package locks/image/native builds remain unverified.
- Static schema writeOnly and catalogue transitions are documentation constraints only. Actual serializer/log/audit allowlists, nonce secrecy/entropy, origin/CSRF/session binding, replay/activation transactions and compromised-backend defenses require future tests.
- Global proof/identity access must remain narrowly restricted; tenant invitation RLS/composite FKs and current delegation checks cannot be replaced by UUID/email knowledge.
- Q-02/Q-05–Q-10, deployment and production data use remain separately gated. No scaffold, install, Docker operation, service start, deployment, commit or push was performed.

## Review artifacts

New: api/IDENTITY-LIFECYCLE.md, architecture/IDENTITY-RELATIONSHIPS.json, architecture/decisions/ADR-012-IDENTITY-CONTRACT-FREEZE.md, planning/FOUNDATION-FREEZE.json and this record (all under docs).
Updated: OpenAPI/API conventions, authorization/authentication/threat/UI design, schema/dictionary/architecture, SRS/traceability/test strategy, ADR-009/register, decision/readiness/implementation plan and documentation index. Existing application code is absent. AGENTS.md and blueprint remain unchanged.

Subsequent approval record (2026-11-07): [project-owner foundation approval](../planning/STAKEHOLDER-APPROVAL-2026-11-07.md) and [current validation](APPROVED-BASELINE-VALIDATION.md) supersede historical pending C-02/Q statuses above. Earlier executed counts/results are preserved as dated evidence, not rerun results or runtime security certification.
