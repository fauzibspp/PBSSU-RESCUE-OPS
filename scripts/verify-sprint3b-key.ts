import { readFileSync, statSync } from "node:fs";
import { createPrivateKey, createPublicKey } from "node:crypto";

const path = process.env.PBSSU_IDENTITY_KEY_FILE;
if (!path) throw new Error("PBSSU_IDENTITY_KEY_FILE is required");
const state = JSON.parse(readFileSync(path, "utf8")) as {
  accessPrivateKey: string;
  accessPublicKey: string;
  encryptionKey: string;
  keyId: string;
};
const privateKey = createPrivateKey(state.accessPrivateKey);
const derived = createPublicKey(privateKey)
  .export({ type: "spki", format: "pem" })
  .toString();
const declared = createPublicKey(state.accessPublicKey)
  .export({ type: "spki", format: "pem" })
  .toString();
const encryptionBytes = Buffer.from(state.encryptionKey, "base64url").length;
const valid =
  encryptionBytes === 32 &&
  /^[a-f0-9]{24}$/.test(state.keyId) &&
  derived === declared;
if (!valid)
  throw new Error("Local development key file format or key pair is invalid");
process.stdout.write(
  JSON.stringify({
    valid,
    encryption_key_bytes: encryptionBytes,
    key_id_format: "24 lowercase hex",
    access_key_pair_matches: true,
    file_bytes: statSync(path).size,
    secret_values_displayed: false,
  }) + "\n",
);
