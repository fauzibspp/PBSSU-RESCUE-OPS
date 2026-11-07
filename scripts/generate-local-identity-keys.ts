import { randomBytes, generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const path = resolve(
  process.env.PBSSU_IDENTITY_KEY_FILE ?? ".cache/m01/identity-keys.json",
);
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const state = {
  accessPrivateKey: privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString(),
  accessPublicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
  encryptionKey: randomBytes(32).toString("base64url"),
  keyId: randomBytes(12).toString("hex"),
};

mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, JSON.stringify(state), { mode: 0o600, flag: "wx" });
process.stdout.write(
  "Generated private local identity keys; values were not displayed\n",
);
