import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const path = "docs/testing/SPRINT-3C-DOCUMENTATION-DELTA.json";
const manifest = JSON.parse(readFileSync(path, "utf8")) as {
  files: Record<string, string>;
};
for (const file of Object.keys(manifest.files)) {
  const content = readFileSync(file, "utf8").replaceAll("\r\n", "\n");
  manifest.files[file] = createHash("sha256").update(content).digest("hex");
}
writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(
  `Updated ${Object.keys(manifest.files).length} Sprint 3-C documentation fingerprints; content values only.\n`,
);
