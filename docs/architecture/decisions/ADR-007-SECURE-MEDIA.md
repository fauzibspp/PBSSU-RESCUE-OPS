# ADR-007: Private media storage

Date 2026-11-06. Status: blueprint direction approved; vendor and scan implementation pending.

Context: field images may contain private people, GPS and malicious files.

Decision: private S3-compatible storage, server-chosen tenant-scoped keys, constrained short-lived quarantine upload grants, content validation/scan, metadata stripping and fresh authorization before brief download grants. Only READY objects can be read; report artifacts follow same authorization.

Alternatives: public buckets expose sensitive data; unrestricted client filenames and content types invite abuse.

Consequences: asynchronous state and retry UI; storage quota/cleanup and scanner dependency; signed URLs remain bearer access until expiry. Q-04/Q-05 define provider, limits and retention. T-013/N03 validate.
