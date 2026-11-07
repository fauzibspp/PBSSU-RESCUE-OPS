# Sprint 3-A Database Validation

**Branch:** `feat/sprint-3-incident-backend`  
**Base:** `19d7f6d6e02c9990d4d71f0ec010b3fac47c085c` (`origin/main`; includes approved contract freeze `50233f511813d45837d237e260a0fb9d8a61d609`)  
**Validation:** 2026-11-07  
**Database:** unique local `pbssu_m01_sprint3a_4486e334d5cb`; pinned PostGIS image `postgis/postgis:18-3.7@sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de`; loopback-only port, isolated labeled network and tmpfs data directory. Credentials are generated into ignored `.cache/sprint3a/database.json` and are not in source or output.

## Implemented database delta

One forward-only Kysely migration: `apps/api/src/database/migrations/004-incidents.ts`, registered as `004-incidents` after migrations 001–003. It creates exactly `incidents`, `incident_locations`, and `change_events`; enables PostGIS for the approved geography column; applies the approved status/category/version/outcome/location/event constraints; adds tenant-composite foreign keys and required indexes; enables and forces RLS with tenant-context `USING` and `WITH CHECK`; and grants runtime only the access needed by the frozen read/create/update shape. The runtime role has no location update/delete or change-event update/delete privileges. The migration `down` is deliberately blocked; no rollback was attempted and no prior migration was modified.

No new permission key, role, API operation, controller, service, assignment, dispatch, movement, GPS/media, sync, report or UI was added. OpenAPI is unchanged from the approved freeze.

## Executed commands and results

| Command | Actual result |
|---|---|
| `npm run db:sprint3a` | PASS. Created a unique labeled local container/network with the pinned image, loopback-only binding and tmpfs database. No existing M01/Sprint 2 namespace was reused. |
| `npm run db:migrate:sprint3a` | PASS on fresh database and repeated no-op validation. Applied/confirmed `001-foundation`, `002-permission-catalog`, `003-vehicles`, `004-incidents` in order. PostgreSQL 18.6, PostGIS 3.7.0. 26 `app` tables; 43 pre-existing permission catalog entries unchanged. |
| `npm run test:integration` with `PBSSU_TEST_DATABASE_STATE` set to `.cache/sprint3a/database.json` | PASS: 3 test files, 15 tests. Includes the existing database, identity and MFA integration regressions plus new restricted-role incident/location/event assertions. All test identities and rows are synthetic. |
| `npm test` | PASS: 2 files, 16 tests, including OpenAPI and frozen-baseline fingerprint checks. |
| `npm run format:check` | PASS. |
| `npm run lint` | PASS. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS. |
| `npm run scope:sprint3a` | PASS: exactly 3 new tables; 75 operation IDs unchanged; no permission seed. |
| `node --import tsx scripts/check-scope.ts` | PASS: M01 remains 22 tables / 40 operations. |
| `node --import tsx scripts/check-sprint2-scope.ts` | PASS: Sprint 2 remains 1 table / 3 operations / 3 permission keys. |
| `git diff --check` | PASS; only Git’s normal line-ending conversion warnings were emitted. |

The first unit/contract run exposed stale M01 fingerprint expectations for OpenAPI and documentation already changed by the approved 2026-11-07 contract-freeze commit. The M00/M01 manifests were preserved. Separate approved Sprint 3 contract/documentation delta manifests now record those exact hashes; the rerun passed all 16 tests. The OpenAPI operation/permission inventory did not change in Sprint 3-A.

## Security and integrity evidence

| Requirement | Evidence/result |
|---|---|
| 26-table inventory | Migration verifier counted exactly 26 application base tables, confirming the prior 23-table M01/Sprint 2 baseline plus three additions. |
| RLS and FORCE RLS | PostgreSQL catalog inspection confirmed both flags on all three new tables. Integration test confirmed the existing tenant RLS inventory contains all 13 expected tenant tables. |
| Tenant policy context | `pg_policies` inspection found one policy for each new table, with both `USING` and `WITH CHECK` constrained by `app.organization_id`. |
| Restricted runtime grants | Runtime connected as `pbssu_m01_runtime`; no tenant context returned zero new-table rows. Runtime can select/insert event rows but cannot update/delete them; it cannot delete incidents or update/delete locations. |
| Tenant isolation | Two synthetic organizations each had an incident, location and event. Runtime tenant transactions read only their own three rows. Tenant A’s update targeting Tenant B’s incident returned no rows; cross-tenant organization insert was denied by RLS (`42501`). |
| Composite relationships | Cross-tenant incident references in locations and events, and a location event pointing to another tenant’s location, failed with FK violation (`23503`). |
| Append-only event path | Runtime update/delete attempts failed with insufficient privilege (`42501`). No mutation trigger or owner bypass was added to the operational role. |
| Constraints | Invalid status, nonpositive incident/event version, COMPLETED without outcome, tombstone true and unpaired location accuracy were rejected by database checks (`23514`). |
| Transaction rollback | A synthetic incident insert followed by an intentional exception left no row after rollback. No database rollback/downgrade was attempted. |
| Existing catalog and API | Exactly 43 catalog entries retained; seven frozen Sprint 3 operation IDs and 75 total OpenAPI operation IDs remain unchanged. |

## Limitations and remaining gates

- These results cover the restricted local application role and privileged migration/test-owner setup separately. The owner role was used only for migration/catalog inspection, fixture setup/cleanup and direct constraint probes; owner results are not presented as RLS evidence.
- No Sprint 3 API implementation exists, so atomic incident/event/audit writes through HTTP, authorization projections, lifecycle compare-and-swap behavior and location `base_version` runtime behavior are not exercised here.
- No migration downgrade was attempted. `004-incidents.down` rejects execution. **M01-R01 remains OPEN**; rollback, backup/restore and production-like recovery are not verified.
- Q-05 retention/disposal, Q-06 deployment/recovery ownership, and Q-08 web/mobile readiness remain OPEN. Sprint 4 assignment/movement and emergency release dependencies remain deferred.
- The local test database/container is disposable, labeled and isolated; no unrelated Docker resources were changed. No deployment, email, push or production data was used.
