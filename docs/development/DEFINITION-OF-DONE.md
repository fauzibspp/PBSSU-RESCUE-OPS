# Definition of Done

PBSSU-DOD-001 v0.1; applies incrementally to delivery scope.

## M00 documentation gate

- Read AGENTS.md and blueprint completely; preserve approved stack and safety boundaries.
- Supply all 13 blueprint deliverables, synthetic flood scenario, assumptions/questions/risks/dependencies and ADR register.
- Cover FR-001–022 and NFR-001–010 across traceability, operations/entities and planned tests.
- Structurally parse OpenAPI, resolve local references and check links/operation IDs/entity/test mappings; record manual cross-review and limits.
- Record environment evidence and exact executed documentation validation results. Application lint/type checks/tests are not applicable before scaffolding, not passed.
- Provide concrete proposed M01 scope and stop for explicit approval. Stakeholder acceptance remains pending.

## Future feature/milestone gate

- Acceptance criteria and traceability satisfied; ADRs/API/schema/data dictionary/UI updated together.
- Explicit authorization and validated DTOs; tenant scope from verified context, forced RLS/composite constraints and negative tests on new paths.
- Migrations reviewed/rehearsed; no secret/real personal data; immutable operational/report evidence preserved.
- Relevant automated tests, lint and type checks executed with results; privacy/accessibility/offline checks as applicable.
- Successful and denied sensitive actions audited, logs redacted; security findings triaged and no unresolved critical/high exposure.
- Operational runbooks, rollback/recovery plan and observability updated; owner reviews complete.
- Feature branch review and small descriptive commits; no force push, unauthorized merge, production deletion or deployment.

The implemented product is not complete merely because documents exist. Planned acceptance tests must later execute successfully. Pilot/production additionally needs UAT, restore evidence, approved operational/data policies and explicit deployment approval.
