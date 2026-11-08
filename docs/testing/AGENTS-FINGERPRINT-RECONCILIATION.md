# AGENTS.md Fingerprint Reconciliation

**Date:** 2026-11-08
**Status:** Authorized baseline maintenance; integrity guard retained

## Finding

`apps/api/test/contract.test.ts` reads each path in `docs/planning/FOUNDATION-FREEZE.json`, normalizes CRLF to LF, hashes the resulting UTF-8 text with SHA-256, and compares it to the expected value. The prior expected fingerprint for `AGENTS.md` was `e78c2320255ca01eeecb7f54aa46606f63ebfb62f90cd9135106741888d32159`. The normalized current fingerprint is `15729fd5ddb66d59735d8801511d2053f391371fccc164fc934c4b074eb95630`.

The current file matches exactly the `AGENTS.md` blob introduced by commit `f0a63c1594a108fa7c511b8087f86c7e25c42224` (`docs: bootstrap autonomous development and Sprint 4 readiness`). That commit added only a reference to `docs/planning/AUTONOMOUS-DEVELOPMENT.md` and explicitly states that the reference does not override approvals, safety constraints or Git rules. It did not remove or weaken any existing instruction. The root attachment was copied into the repository planning directory by the same authorized bootstrap work.

`git ls-files -v -- AGENTS.md` reports uppercase `H`, meaning the file is not marked assume-unchanged. The index blob is `652880b0f379b27c115f896de2db266f8bbc0ccf`, matching the bootstrap commit's tracked blob. `git diff -- AGENTS.md` and `git diff --cached -- AGENTS.md` are empty. Thus this is an outdated expected fingerprint, not a hidden worktree modification or normalization discrepancy.

## Reconciliation

Updated only the `AGENTS.md` expected fingerprint in `FOUNDATION-FREEZE.json` using the existing SHA-256/CRLF-to-LF algorithm. Updated the test to call a shared fingerprint comparison helper and added a negative synthetic-fixture test proving modified instruction content does not match the approved fingerprint. The guard remains active for every frozen file; no path is skipped and no assertion is weakened.

The old and new values above, source commit, authorized content change and rationale are recorded here. This is technical integrity-baseline maintenance, not a change to project policy or runtime security evidence.
