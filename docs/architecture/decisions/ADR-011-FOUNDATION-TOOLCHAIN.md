# ADR-011: Foundation toolchain and encrypted mobile storage candidate

Date 2026-11-06; decision updated 2026-11-07. Status: PARTIALLY APPROVED IMPLEMENTATION BASELINE 2026-11-07: Node24/Nest12/npm workspaces; exact patches/TS toolchain/web/mobile/encryption selection remain verification/later scope gates.

Recommendation: retain Node24 LTS candidate 24.16.0 and npm12.2.2 workspaces with a single package-lock; Nest12.x native ESM/TypeScript6.x; React/react-dom19.3.x with Vite8.x/plugin-react6.x. Retain local Flutter3.47.9/Dart3.13.7 candidate pending independent SDK/runtime validation; conditionally evaluate sqflite_sqlcipher3.4.1/SQLCipher4.x with OS secure-store keys on Android/iOS.

Context/alternatives: npm is already available and its tagged engine range includes Node24.16, avoiding an additional manager installation. pnpm is a future alternative if measured workspace requirements justify it. Plain SQLite is not an encryption fallback. SQLCipher wrapper or native-build changes require explicit review.

Consequences: no package manifest/lock or installed artifact is created by this record. Branch-head patch numbers are evidence candidates, not published verified locks. Exact dependency/peer audits, Argon2 native build, encrypted-device migrations/ABI/page-size/iOS linking and transitive license inventory remain future gates. Mobile encryption selection is conditional and does not block a backend-only M01 after foundation approval. Details: [compatibility assessment](../FOUNDATION-COMPATIBILITY.md).

Approval authority and limits: [project-owner record](../../planning/STAKEHOLDER-APPROVAL-2026-11-07.md). Historical M00/M00.1/M00.2 validation results remain dated prior evidence; no compatibility/security result is approved by this status update. Do not start M01, send real mail or deploy under this baseline commit.
