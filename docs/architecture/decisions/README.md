# Architecture decision records

PBSSU-ADR register v0.3.0, approved foundation record 2026-11-07. ADR-001–007 capture the blueprint's approved direction; implementation details marked proposed remain subject to M00 review. ADR-008 records a proposed contract/concurrency convention. Changes require a superseding ADR, not silent edits to approved history.

| ADR | Decision | Status |
| --- | --- | --- |
| [001](ADR-001-TENANT-ISOLATION.md) | Shared DB, composite constraints, application authorization and forced RLS | Direction approved by blueprint |
| [002](ADR-002-MODULAR-MONOLITH.md) | NestJS modular monolith with same-codebase jobs | Direction approved by blueprint |
| [003](ADR-003-RBAC.md) | Global identity, tenant membership and RBAC | Q-01 APPROVED 2026-11-07 |
| [004](ADR-004-INCIDENT-MONITORING.md) | One tenant per incident, multiple locations, explicit lifecycle | Direction approved; transition guards proposed |
| [005](ADR-005-OFFLINE-SYNC.md) | Encrypted SQLite, durable outbox, idempotency and conflict detection | Direction approved; horizons proposed |
| [006](ADR-006-REPORT-VERSIONING.md) | Frozen report snapshots, online approval, immutable revisions | Direction approved; numbering/maker-checker proposed |
| [007](ADR-007-SECURE-MEDIA.md) | Private S3-compatible media and authorized access | Direction approved; provider/scan details pending |
| [008](ADR-008-API-CONTRACT.md) | OpenAPI 3.1, explicit commands and integer base versions | Contract direction approved; conventions proposed |
| [009](ADR-009-LOCAL-AUTHENTICATION.md) | Local email/password, Argon2id, privileged MFA, rotation/recovery | Q-03 APPROVED POLICY 2026-11-07 |
| [010](ADR-010-DATA-ACCESS-MIGRATIONS.md) | Kysely/pg, explicit SQL migrations, PostgreSQL18/PostGIS3.7 tenant transactions | Q-04 APPROVED BASELINE; runtime/pins unverified |
| [011](ADR-011-FOUNDATION-TOOLCHAIN.md) | Node24/Nest12/npm backend baseline; conditional web/mobile candidates | Backend families approved; exact/web/mobile choices gated |
| [013](ADR-013-APPROVED-CREDENTIAL-HANDOFF.md) | Explicit one-time material handoff; synthetic/mock-only M01 mail | ACCEPTED POLICY/DESIGN 2026-11-07; production delivery not authorized |
| [012](ADR-012-IDENTITY-CONTRACT-FREEZE.md) | Aligned foundation; generic secret-free responses and explicit C-02 handoff | APPROVED BASELINE; C-02 superseded by ADR-013 |

M00.1/M00.2 recommendations were pending when authored. [Explicit owner approval](../../planning/STAKEHOLDER-APPROVAL-2026-11-07.md), not source review or tests, approves the listed foundation on 2026-11-07. See [readiness](../../planning/M01-READINESS.md).

Current baseline approves Q-01/Q-03/Q-04 and resolves C-02 at policy/contract level; no M01 implementation, production delivery or deployment authorization follows.
