import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type KeyMaterial = { keyRef: string; version: number; key: Buffer };
export type KeyProvider = {
  current(): Promise<KeyMaterial>;
  resolve(keyRef: string, version: number): Promise<KeyMaterial | null>;
};

export type EncryptedPayload = {
  algorithm: "aes-256-gcm";
  keyRef: string;
  keyVersion: number;
  iv: string;
  aad: string;
  ciphertext: string;
  authTag: string;
  plaintextSha256: string;
};

export class CiphertextRejectedError extends Error {
  constructor() {
    super("Encrypted payload rejected");
    this.name = "CiphertextRejectedError";
  }
}

function requireKey(material: KeyMaterial): KeyMaterial {
  if (material.key.length !== 32 || !material.keyRef || !Number.isSafeInteger(material.version) || material.version < 1) {
    throw new CiphertextRejectedError();
  }
  return material;
}

export async function encryptPrivateBytes(bytes: Uint8Array, aad: string, keys: KeyProvider): Promise<EncryptedPayload> {
  const material = requireKey(await keys.current());
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", material.key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return {
    algorithm: "aes-256-gcm",
    keyRef: material.keyRef,
    keyVersion: material.version,
    iv: iv.toString("base64url"),
    aad,
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    plaintextSha256: createHash("sha256").update(bytes).digest("hex")
  };
}

export async function decryptPrivateBytes(payload: EncryptedPayload, expectedAad: string, keys: KeyProvider): Promise<Buffer> {
  try {
    if (payload.algorithm !== "aes-256-gcm" || payload.aad !== expectedAad) throw new CiphertextRejectedError();
    const material = await keys.resolve(payload.keyRef, payload.keyVersion);
    if (!material) throw new CiphertextRejectedError();
    requireKey(material);
    const decipher = createDecipheriv("aes-256-gcm", material.key, Buffer.from(payload.iv, "base64url"));
    decipher.setAAD(Buffer.from(expectedAad, "utf8"));
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64url")),
      decipher.final()
    ]);
    if (createHash("sha256").update(plaintext).digest("hex") !== payload.plaintextSha256) throw new CiphertextRejectedError();
    return plaintext;
  } catch {
    throw new CiphertextRejectedError();
  }
}

export class ExplicitSyntheticKeyProvider implements KeyProvider {
  readonly #material: KeyMaterial;
  constructor(key: Buffer, keyRef = "synthetic-local-key", version = 1) {
    if (process.env.NODE_ENV === "production") throw new CiphertextRejectedError();
    this.#material = requireKey({ key: Buffer.from(key), keyRef, version });
  }
  async current() { return this.#material; }
  async resolve(keyRef: string, version: number) {
    return keyRef === this.#material.keyRef && version === this.#material.version ? this.#material : null;
  }
}
