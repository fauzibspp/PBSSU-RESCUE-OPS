# Sanitized flood-monitoring example: 5 November 2026

Documentation-only synthetic scenario inspired by blueprint context; not an operational record, verified field finding, seed dataset, agency acknowledgement or dispatch instruction. Only date, broad operational area, three responders, one vehicle, six locations and departure/arrival times come from the blueprint. Other labels, observations, progression and report reference below are invented to demonstrate design. No contacts, banking information, real responder names, victims or exact coordinates are included.

Organization: Demo Rescue Organization A (fictional). Broad area: Saujana Utama, Saujana Perdana and surrounding locations. Category FLOOD_MONITORING. Personnel: Demo Responder Alpha, Demo Responder Bravo and Demo Responder Charlie. Vehicle: DEMO-RESCUE-01. Display reference example `DEMO-A/2026/000001`, revision 1; final format awaits Q-07.

| Event | MYT (UTC+08:00) | Persisted UTC | Design behavior |
| --- | --- | --- | --- |
| Create incident | 2026-11-05 16:50 | 2026-11-05T08:50:00Z | Operator creates DRAFT, opens with validated source classification. Invented time. |
| Manual assignments | 16:55 | 2026-11-05T08:55:00Z | Three members and one vehicle assigned, DISPATCHED; invented time, no external dispatch. |
| Departure | 17:00 | 2026-11-05T09:00:00Z | Append DEPARTURE against incident vehicle assignment. |
| Arrival | 17:07 | 2026-11-05T09:07:00Z | Append ARRIVAL; authorized transition ON_SCENE. |
| Monitoring | 17:10 | 2026-11-05T09:10:00Z | MONITORING; time invented for example. |
| Return begins | 18:00 | 2026-11-05T10:00:00Z | RETURNING with movement evidence; invented. |
| Completed | 18:20 | 2026-11-05T10:20:00Z | COMPLETED with synthetic outcome; invented. |
| Closed | 18:30 | 2026-11-05T10:30:00Z | Commander closes; report may still be DRAFT; invented. |

| Location (fictional observation point) | Example observation (synthetic) | Risk |
| --- | --- | --- |
| SU-DEMO-01 | Road-edge water observed; no measurement supplied. | MODERATE |
| SU-DEMO-02 | Drain flow observed; further inspection requested. | UNKNOWN |
| SP-DEMO-03 | Water accumulation noted at a demonstration point. | MODERATE |
| SP-DEMO-04 | Visibility limited; no unsupported safety conclusion. | UNKNOWN |
| AREA-DEMO-05 | Repeat monitoring requested. | MODERATE |
| AREA-DEMO-06 | Observation recorded without GPS or photograph. | UNKNOWN |

Location labels are not actual flood findings or safe routes. Each observation receives UUID, incident/location IDs, author membership, occurred_at and received_at. Bravo saves offline at one point; queue shows pending, then server confirms after reconnect. Retrying same operation must not duplicate the update. Optional photo remains quarantined until scan succeeds; no image is supplied here.

Operator creates report snapshot with movement timeline, personnel, vehicle and all six observations. Victims: not recorded; agency involvement: not recorded; these are not claims of absence. One authorized user submits revision 1; a different commander approves online. Approved PDF/text use redacted snapshot plus approval record. Correction creates revision 2 and preserves revision 1. Download/copy creates no delivery or official acknowledgement record. UAT evidence maps to T-008–020; none executed in M00.
