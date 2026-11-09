import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

export default async function globalTeardown(): Promise<void> {
  const fixturePath = resolve(".cache/uf01/browser-fixture.json");
  if (existsSync(fixturePath)) unlinkSync(fixturePath);
}
