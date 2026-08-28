/**
 * Encryption for the SIM tokens the database holds.
 *
 * A row in `sims` carries a live Mytel bearer token and its refresh token. Stored
 * as text, anyone who reaches the volume, a stray copy, or one of the backups
 * written by scripts/backup-db.js can transfer balance as that SIM. Encrypting the
 * two columns means the database file alone is not enough — the key lives in the
 * environment, not on the disk beside it.
 *
 * AES-256-GCM, random 12-byte IV per value, authentication tag kept alongside, so
 * a tampered ciphertext fails to open rather than decoding to something else.
 *
 * The key derives from `TOKEN_ENC_KEY` if set, otherwise from `AUTH_SECRET` — the
 * secret a deployment already has to configure. The consequence is worth stating
 * plainly: **rotating that secret makes existing tokens unreadable** and every SIM
 * needs logging in again. Nothing breaks when it happens; a value that will not
 * open is reported as absent, which the token layer already treats as "re-login".
 *
 * Node-only (`node:crypto`). The Edge middleware imports lib/auth, never this.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/** Version marker so the format can change without guessing at old values. */
const PREFIX = "enc.v1.";
const IV_BYTES = 12;

let cachedKey: Buffer | null | undefined;
let warnedNoKey = false;
let warnedUndecryptable = false;

function derivedKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;

  const material = process.env.TOKEN_ENC_KEY || process.env.AUTH_SECRET || "";
  if (!material) {
    if (process.env.NODE_ENV === "production") {
      // Production already refuses to mint sessions without AUTH_SECRET, so nothing
      // can log in to write a token here — but say so rather than quietly storing
      // secrets in the clear.
      if (!warnedNoKey) {
        console.error(
          "[crypto] No TOKEN_ENC_KEY or AUTH_SECRET — SIM tokens cannot be encrypted at rest."
        );
        warnedNoKey = true;
      }
      cachedKey = null;
      return null;
    }
    // Dev convenience, matching lib/auth's fallback: a fixed local key keeps the
    // encrypted path exercised without demanding secrets for `next dev`.
    cachedKey = scryptSync("dev-insecure-secret", "myshare.token.v1", 32);
    return cachedKey;
  }

  cachedKey = scryptSync(material, "myshare.token.v1", 32);
  return cachedKey;
}

/** True for a value this module produced, as opposed to a legacy plaintext one. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/**
 * Wrap a secret for storage. Returns the input unchanged when no key is available,
 * so a misconfigured deployment degrades to its previous behaviour instead of
 * losing the ability to store tokens at all.
 */
export function encryptSecret(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (isEncrypted(value)) return value;

  const key = derivedKey();
  if (!key) return value;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".")
  );
}

/**
 * Unwrap a stored secret. A value written before encryption was introduced comes
 * back as-is, which is what lets the migration be lazy. A value that will not open
 * — wrong key, truncated column, tampering — comes back as null: the caller then
 * sees a SIM with no token and asks for a fresh login, which is the honest outcome.
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!isEncrypted(value)) return value;

  const key = derivedKey();
  if (!key) return null;

  const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(".");
  if (!ivB64 || !tagB64 || !dataB64) return null;

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    if (!warnedUndecryptable) {
      console.error(
        "[crypto] A stored SIM token could not be decrypted — the encryption key has " +
          "most likely changed. Affected SIMs need logging in again."
      );
      warnedUndecryptable = true;
    }
    return null;
  }
}
