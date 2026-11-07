import { readFileSync, writeFileSync } from "node:fs";

interface DevelopmentDatabaseState {
  runtimeUrl: string;
  identityUrl: string;
}

const database = JSON.parse(
  readFileSync(new URL("../.cache/m01/database.json", import.meta.url), "utf8"),
) as DevelopmentDatabaseState;
for (const candidate of [database.runtimeUrl, database.identityUrl]) {
  const url = new URL(candidate);
  if (
    url.protocol !== "postgresql:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  ) {
    throw new Error(
      "Local environment generation requires the M01 loopback database",
    );
  }
}
const contents = [
  "NODE_ENV=development",
  "HOST=127.0.0.1",
  "PORT=3301",
  "MAIL_MODE=mock",
  "TRUSTED_WEB_ORIGIN=http://127.0.0.1:5173",
  `DATABASE_URL=${database.runtimeUrl}`,
  `IDENTITY_DATABASE_URL=${database.identityUrl}`,
  "",
].join("\n");
writeFileSync(new URL("../.env", import.meta.url), contents, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});
process.stdout.write(
  "Created ignored local M01 environment file (values withheld).\n",
);
