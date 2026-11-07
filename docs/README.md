# M00 documentation baseline

Version 0.3.0, foundation approved by project owner 2026-11-07; architecture follows [PROJECT-BLUEPRINT.md](planning/PROJECT-BLUEPRINT.md). [Approval record](planning/STAKEHOLDER-APPROVAL-2026-11-07.md) accepts foundation decisions only, not remaining operational policies, deployment or M01 implementation.

| Deliverable | Document |
| --- | --- |
| Software Requirements Specification | [SRS](requirements/SRS.md) |
| System architecture | [Architecture](architecture/SYSTEM-ARCHITECTURE.md) |
| Database schema and ERD | [Schema](architecture/DATABASE-SCHEMA.md) |
| OpenAPI 3.1 contract | [OpenAPI JSON](api/openapi.json), [contract conventions](api/README.md) |
| UI/UX and screen flows | [UI/UX](design/UI-UX.md) |
| Implementation plan and sprint backlog | [Plan](planning/IMPLEMENTATION-PLAN.md) |
| Security threat model | [Threat model](security/THREAT-MODEL.md) |
| Test strategy | [Tests](testing/TEST-STRATEGY.md) |
| Data dictionary | [Dictionary](architecture/DATA-DICTIONARY.md) |
| Architecture decisions | [ADR register](architecture/decisions/README.md) |
| Development setup and environment inspection | [Setup](development/SETUP.md) |
| Definition of Done | [DoD](development/DEFINITION-OF-DONE.md) |
| Requirements traceability | [Matrix](requirements/TRACEABILITY.md) |

Supporting records: [assumptions, questions, risks and dependencies](planning/DECISION-REGISTER.md), [sanitized scenario](examples/FLOOD-MONITORING-2026-11-05.md), [M00 validation](testing/M00-VALIDATION.md).

M00.1 review package (foundation decisions subsequently approved 2026-11-07): [authorization model](security/AUTHORIZATION-MODEL.md), [local authentication and recovery](security/AUTHENTICATION-ARCHITECTURE.md), [version/database compatibility](architecture/FOUNDATION-COMPATIBILITY.md), ADR-009–011 in the ADR register, [M01 readiness](planning/M01-READINESS.md) and [M00.1 validation](testing/M00-1-VALIDATION.md). M01 remains unauthorized.

Authority order: AGENTS.md, blueprint v1.0, approved ADRs, SRS, API/schema design. Conflicts require a recorded decision. All newly introduced policies and numerical targets remain proposals until approved. Module IDs M01–M14 in the blueprint identify capabilities; delivery milestones use M00, M01, then sprint gates as explained in the plan.

M00.2 candidate freeze: [identity lifecycle/guard contract](api/IDENTITY-LIFECYCLE.md), [identity FK inventory](architecture/IDENTITY-RELATIONSHIPS.json), [freeze manifest](planning/FOUNDATION-FREEZE.json), ADR-012, [validation](testing/M00-2-VALIDATION.md), and updated [readiness](planning/M01-READINESS.md). Historical candidate statuses are superseded by the explicit 2026-11-07 foundation approval and C-02 contract below. No M01 implementation authorized.

Approved baseline: [owner authority](planning/STAKEHOLDER-APPROVAL-2026-11-07.md), [dedicated C-02 handoff](security/CREDENTIAL-HANDOFF.md), [approval/baseline report](planning/APPROVAL-BASELINE-REPORT.md), [new validation evidence](testing/APPROVED-BASELINE-VALIDATION.md) and current freeze manifest. Historical M00/M00.1/M00.2 validation counts/statuses remain dated prior evidence. No production secret delivery, M01 implementation or push authorized.
