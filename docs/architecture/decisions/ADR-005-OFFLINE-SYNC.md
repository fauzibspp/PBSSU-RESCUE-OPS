# ADR-005: Offline-first field synchronization

Date 2026-11-06. Status: blueprint direction approved; retention horizons proposed.

Context: connectivity may fail during field monitoring; retries and concurrent writes are unavoidable.

Decision: encrypted SQLite partitioned by account/tenant, durable ordered outbox, UUID records and operation IDs, server transactional idempotency receipts with payload hash, integer-version conflicts, append-only observations, authorized cursor pull/tombstones. Control commands/approvals stay online.

Alternatives: unconditional last-write-wins risks lost commands; online-only entry fails field requirements.

Consequences: UI distinguishes pending from confirmed; cursor scope loss/expiry requires safe resnapshot. Provisional 30-day horizon and 90-day receipts await Q-05. Never replay pending entries into a new tenant. T-014/015/016/N04 cover failure paths.
