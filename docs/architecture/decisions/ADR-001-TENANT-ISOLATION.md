# ADR-001: Shared database tenant isolation

Date 2026-11-06. Status: approved direction from blueprint; implementation design proposed.

Context: multiple organizations share infrastructure and some login identities, but operational data must remain separate.

Decision: shared PostgreSQL/PostGIS database; verified membership context, explicit service authorization, tenant-leading composite foreign keys and forced RLS on all tenant tables. Runtime is non-owner/NOBYPASSRLS. Platform administrator is not an operational superuser. Use transaction-local context and tenant-scoped jobs/caches/storage.

Alternatives: database/schema per tenant increase provisioning/migration burden; application filters alone have insufficient defense in depth. Neither is selected for MVP.

Consequences: every query/migration needs isolation review; pool/worker and constraint tests are mandatory. Global identity/bootstrap access requires narrow separate service grants. Privileged DB operations remain an infrastructure risk. See Q-01/Q-04 and T-N01.
