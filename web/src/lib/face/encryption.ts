import "server-only";
import crypto from "node:crypto";

// Face embeddings must be reversible (compared against a live scan on
// every clock-in), unlike passwords — so AES-256-GCM, not a one-way hash.
// The key never lives in git; it's a 32-byte hex string in .env.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const key = process.env.FACE_EMBEDDING_KEY;
  if (!key) {
    throw new Error("FACE_EMBEDDING_KEY is not set — check your .env file.");
  }
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error("FACE_EMBEDDING_KEY must be a 32-byte (64 hex char) key.");
  }
  return buf;
}

// Stores iv + authTag + ciphertext together, base64, so a single string
// column holds everything needed to decrypt.
export function encryptEmbedding(embedding: number[]): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(embedding), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptEmbedding(stored: string): number[] {
  const raw = Buffer.from(stored, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}
