# M00.1 validation and evidence

PBSSU-VAL-002 v0.1, 2026-11-06. Documentation and architecture decision review only. The historical [M00 validation](M00-VALIDATION.md) remains unchanged as prior execution evidence except for a forward pointer; no prior checks are presented as new runs.

## Inputs and source verification

Read AGENTS.md, blueprint, decision register, M00 validation, system architecture, database schema, all existing ADRs, API conventions and implementation plan. Re-read any portions omitted by tool-output truncation. Retained the existing docs/m00-architecture-baseline feature branch and pre-existing M00 changes; no commit/push. No application/dependency/container/service files were created.

Official sources were accessible for framework/runtime requirements, database/image features, Kysely releases and transaction/migration behavior, pg pool rules, React/Vite/plugin manifests, npm tag engines, Flutter archive, SQLCipher publisher/community/license and OWASP/RFC security guidance. Linked evidence and DOCUMENTED/OBSERVED/INFERRED/UNVERIFIED labels are in [compatibility](../architecture/FOUNDATION-COMPATIBILITY.md). Direct npm registry requests failed through the web tool; exact registry/integrity/peer compatibility is unverified. TypeORM migration page had no extractable content; attempted PostGIS release permalink/versioned plugin changelog also failed. No dependency installs or shell-network workaround used.

Re-executed node --version (v24.16.0), npm --version (12.2.2) and read local Flutter cache (3.47.9/Dart3.13.7). No Flutter doctor/runtime/native build, DB/RLS/pool/migration exercise, Docker command or application test was run. SDK metadata does not independently verify a published SDK/toolchain pair. Source-supported/inferred compatibility is not runtime-tested compatibility.

## Consistency findings

- Q-01 recommendation supplies exact existing permission keys, role templates, scoped grants, DENY defaults, restricted delegation and mandatory cross-tenant negative tests. Operators/commanders receive minimized assignment rosters without private contacts; responder sync transport never replaces underlying incident permission checks.
- Q-03 recommends local credentials and privileged MFA. The existing M00 Session-only login and 28-entity schema cannot fully represent this proposal; explicit C-01 pre-code contract/schema work is recorded rather than inventing implemented endpoints/tables.
- Q-04 recommends explicit SQL migrations and transaction-bound data access; approved shared database/RLS/composite-FK architecture is retained. Maintainer PostGIS matrix identifies 18-3.7 as supported candidate; stale 3.6 image snippets are not used to approve an outdated pin.
- Proposed durations, role policy, recovery custody, exact package locks and conditional mobile encryption remain pending stakeholder approval. Q-02 and Q-05–Q-10 remain open with scoped feature/pilot gates. M01 has not begun.

## Automated documentation checks

Executed an inline Python check using the existing jsonschema package (bytecode writes disabled), exit 0/PASS: 837 assertions/schema checks; 35 Markdown files and 82 valid local links; all 537 OpenAPI local refs resolved; all 75 schemas passed Draft202012Validator.check_schema. The 52 exact operation permission keys were covered with no unknown keys by 17 explicit grant groups plus the four global session/credential-entry keys. Six role templates resolved to known groups; structural assertions confirmed platform-only metadata grants, commander-only approval, no responder control/export grants, no auditor domain-write grants and minimized assignment-roster grants for operators/commanders.

Historical API shape remained 38 paths/52 operations; schema/dictionary retained 28 matching baseline entities; matrix retained 22 FR and 10 NFR rows. Q-01/Q-03/Q-04/C-01 appeared in both register/readiness; three new ADRs retained PROPOSED/stakeholder-approval-pending status. All 35 working-tree changed/untracked files (including pre-existing M00 work) were documentation-only, newline-terminated and free of trailing whitespace. git diff --check also exited 0. The checks examined the final recommendation text and baseline contract; they do not execute service authorization, MFA/recovery, database isolation, dependency resolution or build compatibility. No application test, full OpenAPI certification or benchmark result is claimed.

Manual follow-up also identified first-admin/member enrollment activation semantics: current M00 createMembership/onboarding cannot grant active powers before invite acceptance/MFA in the proposed design. This is included in C-01 pre-code alignment, alongside MFA responses and identity/grant schema additions. All remaining approval/runtime/policy blockers are explicit in readiness; no stakeholder gate is silently marked resolved.

## Files for review

Created: security/AUTHORIZATION-MODEL.md, security/AUTHENTICATION-ARCHITECTURE.md, architecture/FOUNDATION-COMPATIBILITY.md, architecture/decisions/ADR-009-LOCAL-AUTHENTICATION.md, architecture/decisions/ADR-010-DATA-ACCESS-MIGRATIONS.md, architecture/decisions/ADR-011-FOUNDATION-TOOLCHAIN.md, planning/M01-READINESS.md and this validation record (all under docs).

Updated: docs index, decision register, architecture, schema/dictionary, ADR-003/register, SRS, API conventions, implementation plan, test strategy and M00 validation forward pointer. Existing openapi.json is intentionally unchanged; its auth completeness gap is a recorded blocker, not a successful MFA contract check. AGENTS.md/blueprint are unchanged. No stakeholder approval recorded.

Subsequent approval record (2026-11-07): [project-owner foundation approval](../planning/STAKEHOLDER-APPROVAL-2026-11-07.md) and [current validation](APPROVED-BASELINE-VALIDATION.md) supersede historical pending C-02/Q statuses above. Earlier executed counts/results are preserved as dated evidence, not rerun results or runtime security certification.
