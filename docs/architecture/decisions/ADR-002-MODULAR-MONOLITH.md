# ADR-002: Modular monolith

Date 2026-11-06. Status: approved blueprint direction.

Context: MVP requires transactional consistency and maintainability with uncertain team capacity.

Decision: NestJS modules own domain services; PostgreSQL is authoritative. Worker jobs use the same codebase with tenant context and a transactional DB outbox. React/Vite and Flutter use REST contracts.

Alternatives: microservices add distributed transactions and operational cost; an unstructured monolith obscures authorization boundaries.

Consequences: explicit module interfaces, dependency rules and transaction ownership are required. Split deployment only after measured workload/ownership needs justify a new ADR. No broker/vendor dependency is approved by this decision.
