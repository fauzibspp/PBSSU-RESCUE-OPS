# ADR-010: Kysely, explicit SQL migrations and tenant transactions

Date 2026-11-06; decision updated 2026-11-07. Status: APPROVED IMPLEMENTATION BASELINE 2026-11-07: Q-04 PostgreSQL18/PostGIS3.7/Kysely+pg/explicit SQL; exact pins/digests/runtime verification outstanding.

Context: RLS, composite tenant/incident foreign keys, PostGIS, immutable reports and transaction-local context need reviewable database-native control.

Recommendation: Kysely 0.29.8 + pg 8.x, same-version Kysely Migrator with explicit reviewed SQL; PostgreSQL18/PostGIS3.7.0 via candidate Debian postgis/postgis:18-3.7, digest pinned after approved verification. Tenant repositories take the transaction object; set trusted tenant context inside it; no root pool queries or session-scoped settings. Distinct migrator/owner, runtime and narrow identity/bootstrap access boundaries. No external pooler initially.

Alternatives: TypeORM remains viable with QueryRunner/custom SQL; Prisma remains viable with feature-specific custom migrations. Neither is selected in this proposal because explicit SQL is central to the security design, not because they inherently prevent RLS/composite keys. No automatic schema synchronization.

Consequences: manual migration/type upkeep and fresh/upgrade/failed-migration/RLS/pool/concurrency evidence required. Upstream documented features do not prove local compatibility. No DB/image was pulled, started or modified. Exact pg release/image digest and runtime extension verification remain open. [Compatibility assessment](../FOUNDATION-COMPATIBILITY.md) records evidence, pooling limitations and alternatives. T-N01/T-N09 remain future runtime gates.

Approval authority and limits: [project-owner record](../../planning/STAKEHOLDER-APPROVAL-2026-11-07.md). Historical M00/M00.1/M00.2 validation results remain dated prior evidence; no compatibility/security result is approved by this status update. Do not start M01, send real mail or deploy under this baseline commit.
