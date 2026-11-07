import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPrivateKey, createPublicKey } from "node:crypto";

interface LocalSecretState {
  accessPrivateKey: string;
  accessPublicKey: string;
  encryptionKey: string;
  keyId: string;
}

export interface LocalSecrets {
  accessPrivateKey: ReturnType<typeof createPrivateKey>;
  accessPublicKey: ReturnType<typeof createPublicKey>;
  encryptionKey: Buffer;
  keyId: string;
}

let cached: LocalSecrets | undefined;

export function loadLocalSecrets(): LocalSecrets {
  if (cached) {
    return cached;
  }
  const path = process.env.PBSSU_IDENTITY_KEY_FILE
    ? resolve(process.env.PBSSU_IDENTITY_KEY_FILE)
    : new URL("../../../../.cache/m01/identity-keys.json", import.meta.url);
  const state = JSON.parse(readFileSync(path, "utf8")) as LocalSecretState;
  const encryptionKey = Buffer.from(state.encryptionKey, "base64url");
  if (encryptionKey.length !== 32 || !state.keyId) {
    throw new Error("Invalid private local identity key state");
  }
  cached = {
    accessPrivateKey: createPrivateKey(state.accessPrivateKey),
    accessPublicKey: createPublicKey(state.accessPublicKey),
    encryptionKey,
    keyId: state.keyId,
  };
  return cached;
}
