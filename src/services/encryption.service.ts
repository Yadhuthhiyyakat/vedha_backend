import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// ─── Constants ────────────────────────────────────────────────────────────────
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;   // 96-bit IV — NIST recommended for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag — GCM default

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The serialised shape stored in `encrypted_data` column.
 *
 * Fields:
 *  v    — key version (for future key rotation without breaking existing docs)
 *  iv   — base64-encoded 12-byte random IV, unique per encryption operation
 *  tag  — base64-encoded 16-byte GCM authentication tag (tamper detection)
 *  data — base64-encoded ciphertext
 */
export interface EncryptedBlob {
  v: number;
  iv: string;
  tag: string;
  data: string;
}

// ─── Key resolution ───────────────────────────────────────────────────────────

/**
 * Returns the active 32-byte AES-256 key buffer.
 * To support key rotation, extend this to a map keyed by version number.
 */
function resolveKey(version: number): Buffer {
  // Currently only version 1 is supported.
  // When rotating: add ENCRYPTION_KEY_V2, ENCRYPTION_KEY_V3, etc. and select by version.
  if (version !== 1) {
    throw new Error(`Unsupported encryption key version: ${version}`);
  }

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error(
      "ENCRYPTION_KEY env variable is missing or shorter than 32 characters"
    );
  }

  // Use the first 32 characters as the key (UTF-8 encoded)
  return Buffer.from(raw.slice(0, 32), "utf8");
}

function currentKeyVersion(): number {
  return parseInt(process.env.ENCRYPTION_KEY_VERSION ?? "1", 10);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * A fresh cryptographically random IV is generated on every call — this is
 * intentional. Reusing an IV with the same key breaks GCM security guarantees.
 *
 * @param plaintext — any UTF-8 string (typically JSON.stringify of document_data)
 * @returns a JSON string (EncryptedBlob) safe to store in the database
 */
export function encryptData(plaintext: string): string {
  const version = currentKeyVersion();
  const key = resolveKey(version);

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const blob: EncryptedBlob = {
    v: version,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };

  return JSON.stringify(blob);
}

/**
 * Decrypts an EncryptedBlob JSON string produced by `encryptData`.
 *
 * AES-GCM verifies the auth tag during `decipher.final()` — if the ciphertext
 * or tag has been tampered with in any way, this will throw an error.
 *
 * @param raw — the JSON string stored in the `encrypted_data` column
 * @returns the original plaintext UTF-8 string
 * @throws if the blob is malformed, the key is wrong, or data has been tampered with
 */
export function decryptData(raw: string | EncryptedBlob | unknown): string {
  let blob: EncryptedBlob;

  if (typeof raw === "string") {
    try {
      blob = JSON.parse(raw) as EncryptedBlob;
    } catch {
      throw new Error("Encrypted blob is not valid JSON string");
    }
  } else if (typeof raw === "object" && raw !== null) {
    blob = raw as EncryptedBlob;
  } else {
    throw new Error("Invalid encrypted blob format");
  }

  if (!blob.v || !blob.iv || !blob.tag || !blob.data) {
    throw new Error("Encrypted blob is missing required fields (v, iv, tag, data)");
  }

  const key = resolveKey(blob.v);
  const iv = Buffer.from(blob.iv, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const ciphertext = Buffer.from(blob.data, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(), // ← throws ERR_CRYPTO_GCM_AUTH_TAG_FAILED if tampered
  ]);

  return decrypted.toString("utf8");
}

// ─── Binary Buffer Encryption (for Supabase Storage Files) ────────────────────

/**
 * Encrypts a raw binary Buffer (e.g. file/photo uploaded by user) using AES-256-GCM.
 * Packed format: [1-byte VERSION][12-byte IV][16-byte AUTH_TAG][CIPHERTEXT]
 */
export function encryptBuffer(inputBuffer: Buffer): Buffer {
  const version = currentKeyVersion();
  const key = resolveKey(version);

  const iv = randomBytes(IV_LENGTH); // 12 bytes
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(inputBuffer),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag(); // 16 bytes
  const versionBuf = Buffer.from([version]); // 1 byte

  return Buffer.concat([versionBuf, iv, tag, encrypted]);
}

/**
 * Decrypts a binary Buffer packed by `encryptBuffer`.
 * Expected input format: [1-byte VERSION][12-byte IV][16-byte AUTH_TAG][CIPHERTEXT]
 */
export function decryptBuffer(packed: Buffer): Buffer {
  const HEADER_SIZE = 1 + IV_LENGTH + TAG_LENGTH; // 1 + 12 + 16 = 29 bytes
  if (packed.length < HEADER_SIZE) {
    throw new Error("Encrypted buffer is too short to contain header information");
  }

  const version = packed.readUInt8(0);
  const key = resolveKey(version);

  const iv = packed.subarray(1, 1 + IV_LENGTH);
  const tag = packed.subarray(1 + IV_LENGTH, HEADER_SIZE);
  const ciphertext = packed.subarray(HEADER_SIZE);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(), // throws if tampered
  ]);
}
