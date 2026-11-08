import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const path = "docs/testing/SPRINT-4-CONTRACT-DELTA.json";
const manifest = JSON.parse(readFileSync(path, "utf8")) as {
  files: Record<string, string>;
};
const reviewedFiles = [
  "docs/architecture/DATA-DICTIONARY.md",
  "docs/architecture/DATABASE-SCHEMA.md",
  "docs/testing/TEST-STRATEGY.md",
  "docs/security/AUTHORIZATION-MODEL.md",
];
for (const file of reviewedFiles) {
  if (!(file in manifest.files))
    throw new Error(`No approved Sprint 4 fingerprint entry for ${file}`);
  const source = readFileSync(file, "utf8").replaceAll("\r\n", "\n");
  manifest.files[file] = createHash("sha256").update(source).digest("hex");
}
writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(
  `Updated only ${reviewedFiles.length} reviewed Sprint 4 documentation fingerprints.\n`,
);
