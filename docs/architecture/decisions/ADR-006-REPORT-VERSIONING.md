# ADR-006: Report snapshots and approval

Date 2026-11-06. Status: approved blueprint direction; reference format/year and maker/checker proposed.

Context: approved operational reports must remain reproducible despite later source corrections.

Decision: allocate tenant/year reference atomically; revisions share reference. Freeze snapshot on submission; record online approval/rejection and digest; approved/rejected versions remain unchanged. Corrections create a new draft revision. PDF/text generated only from approved snapshot plus approval record with default privacy whitelist.

Alternatives: regenerating historical reports from live rows or editing approved reports invalidates evidence.

Consequences: extra storage and schema-versioned rendering; approval does not close the incident and exports do not prove delivery. Proposed different submitter/approver and local incident year need Q-02/Q-07 approval. T-008/018/019/020 validate.
