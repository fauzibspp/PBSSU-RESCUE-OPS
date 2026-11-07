# ADR-004: Incident lifecycle and multiple locations

Date 2026-11-06. Status: blueprint direction approved; exceptional transitions and guards proposed.

Context: one operation can monitor several places, with personnel, vehicle movements and independent evidence.

Decision: one tenant-owned incident with incident_locations; explicit guarded lifecycle through DRAFT, OPEN, DISPATCHED, ON_SCENE, MONITORING, RETURNING, COMPLETED, CLOSED. Authorized cancellation records a reason. Assignments are human-authorized internal records. Updates/movements append; corrections preserve originals.

Alternatives: one incident per observation loses shared timeline; arbitrary status editing destroys lifecycle evidence.

Consequences: location/assignment references must match incident and tenant. Completion is separate from report approval. No auto-dispatch or invented agency acknowledgement. Q-02 resolves alternate paths; T-007/009/010/011/017 validate behavior.
