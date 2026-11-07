# ADR-008: API contract and concurrency commands

Date 2026-11-06. Status: OpenAPI 3.1 direction approved by blueprint; detailed conventions proposed.

Context: web/mobile/QA need one reviewable contract before implementation.

Decision: REST `/v1`, OpenAPI 3.1 JSON, explicit transition/assignment/report-decision commands, allowlisted DTOs, UUID identifiers, UTC instants, integer base_version for guarded changes, bounded pages/batches and standardized error responses. Tenant selector header requires verified membership; no tenant field in write DTOs.

Alternatives: ad-hoc client types drift; generic status PATCH encourages unauthorized workflows.

Consequences: schema/operation IDs become traceability keys. Breaking changes require reviewed contract versioning and client compatibility policy. M00 structural checks are not full runtime or standards certification; Q-04 selects future validator tooling.
