# Proposed UI Browser Acceptance Matrix

**Status:** Proposed for owner review; operational UI is not implemented.

| Scenario                       | Desktop  | Mobile viewport | Acceptance evidence                                                                                                                                                                                                                                               |
| ------------------------------ | -------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview boot and reload        | Required | Required        | Render, no uncaught page/console errors, no unexpected failed requests; screenshot                                                                                                                                                                                |
| Login validation               | Required | Required        | Existing `LoginInput` only; accessible labels and generic failure behavior                                                                                                                                                                                        |
| Privileged MFA                 | Required | Required        | Tenant-only Commander and Operator must complete existing TOTP challenge; password-only session cannot reach protected view                                                                                                                                       |
| Session handoff                | Required | Required        | Web cookie flow only; no credential material in browser storage or URL; trusted-origin/CSRF behavior preserved                                                                                                                                                    |
| Membership selection           | Required | Required        | Only memberships returned for authenticated user; switching organization reloads tenant-bound data                                                                                                                                                                |
| Role-aware navigation          | Required | Required        | Uses selected membership role codes for display only; direct unauthorized request remains denied by API                                                                                                                                                           |
| Role authorization negatives   | Required | Required        | Commander/Operator read follows exact grants; Organization Admin has no automatic incident access; Platform Super Admin has no tenant-content bypass; Auditor is read-only; Field Responder remains assignment-scoped and fail-closed without assignment evidence |
| Incident list                  | Required | Required        | Loading, empty, populated, pagination, generic error, forbidden and expired-session states; no cross-tenant records                                                                                                                                               |
| Incident detail                | Required | Required        | Only approved read-only fields; cancellation reason and other excluded sensitive fields never rendered                                                                                                                                                            |
| Logout / expiry                | Required | Required        | Existing revoke operation; clear local view state and return to sign-in without exposing tokens                                                                                                                                                                   |
| Tenant spoofing / cross-tenant | Required | Required        | Tampered selector receives generic denied/not-found contract; no data leakage                                                                                                                                                                                     |
| Network and console            | Required | Required        | Capture failed requests, console errors and page errors; redact request headers/bodies from artifacts                                                                                                                                                             |
| Keyboard                       | Required | Required        | Logical tab order, visible focus, skip link, form errors associated with inputs, dialogs operable without pointer                                                                                                                                                 |
| Accessibility                  | Required | Required        | Automated axe scan plus manual keyboard and screen-reader spot check; no critical violations                                                                                                                                                                      |
| Responsive behavior            | Required | Required        | No horizontal overflow at configured desktop and mobile sizes; controls remain usable                                                                                                                                                                             |

## Evidence policy

Use synthetic accounts and synthetic incidents. Capture screenshots for desktop
and mobile success/empty/error states. Preserve Playwright traces on failure;
videos remain optional. Never capture tokens, MFA codes, recovery material,
real operational records, or sensitive request headers. A scenario is PASS only
when the corresponding UI exists and the configured test actually runs; all
product scenarios above remain NOT RUN until implementation is separately
authorized.
