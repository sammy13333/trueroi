import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const keyPath = path.join(process.cwd(), ".trueroi-local-key");
let localKey: Promise<Buffer> | undefined;

async function encryptionKey(): Promise<Buffer> {
  const configuredKey = process.env.TRUEROI_ENCRYPTION_KEY;
  if (configuredKey) {
    const key = Buffer.from(configuredKey, "hex");
    if (key.length !== 32) throw new Error("TRUEROI_ENCRYPTION_KEY must be a 64-character hex value.");
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    const databaseSecret = process.env.DATABASE_URL ?? process.env.STORAGE_URL;
    if (!databaseSecret) throw new Error("A production database connection is required.");
    return createHash("sha256").update(databaseSecret).digest();
  }
  localKey ??= loadOrCreateLocalKey();
  return localKey;
}

async function loadOrCreateLocalKey(): Promise<Buffer> {
  try {
    return Buffer.from((await readFile(keyPath, "utf8")).trim(), "hex");
  } catch {
    const key = randomBytes(32).toString("hex");
    await writeFile(keyPath, key, { mode: 0o600 });
    await chmod(keyPath, 0o600);
    return Buffer.from(key, "hex");
  }
}

/** Encrypt a credential before it is persisted. Never return this field to clients. */
export async function encryptSecret(value: string): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

export async function decryptSecret(value: string): Promise<string> {
  const [ivText, tagText, cipherText] = value.split(".");
  if (!ivText || !tagText || !cipherText) throw new Error("Stored credential is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", await encryptionKey(), Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(cipherText, "base64")), decipher.final()]).toString("utf8");
}
