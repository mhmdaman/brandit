import crypto from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);
const KEY_LENGTH = 64; // 64 bytes derived key

/**
 * Hashes a plain-text password using crypto.scrypt with a random 16-byte salt.
 * Formatted and stored as "saltHex:hashHex".
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies a plain-text password against a stored "saltHex:hashHex" string
 * using crypto.timingSafeEqual to prevent timing attacks.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split(":");
    if (parts.length !== 2) {
      return false;
    }

    const [saltHex, hashHex] = parts;
    const salt = Buffer.from(saltHex, "hex");
    const storedHash = Buffer.from(hashHex, "hex");

    if (salt.length !== 16 || storedHash.length !== KEY_LENGTH) {
      return false;
    }

    const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

    if (storedHash.length !== derivedKey.length) {
      return false;
    }

    return crypto.timingSafeEqual(storedHash, derivedKey);
  } catch {
    return false;
  }
}
