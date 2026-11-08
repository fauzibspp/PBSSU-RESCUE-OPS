import { createCipheriv, randomBytes } from "node:crypto";
import { loadLocalSecrets } from "../identity/local-secrets.js";

export function protectCancellationReason(
  reason: string,
  context: { organizationId: string; incidentId: string; actorUserId: string },
) {
  const { encryptionKey, keyId } = loadLocalSecrets();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
  cipher.setAAD(
    Buffer.from(
      `pbssu:audit:cancellation:v1:${context.organizationId}:${context.incidentId}:${context.actorUserId}`,
      "utf8",
    ),
  );
  const encrypted = Buffer.concat([
    cipher.update(reason, "utf8"),
    cipher.final(),
  ]);
  return {
    cancellation_reason: {
      version: 1,
      algorithm: "A256GCM",
      key_ref: keyId,
      ciphertext: [nonce, cipher.getAuthTag(), encrypted]
        .map((part) => part.toString("base64url"))
        .join("."),
    },
  };
}
