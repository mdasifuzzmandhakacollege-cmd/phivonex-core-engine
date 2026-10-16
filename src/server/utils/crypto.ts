import argon2 from 'argon2';
import crypto from 'crypto';

/**
 * Hash password with Argon2id
 * Enforces memoryCost, timeCost, and parallelism standards
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 1,
  });
}

/**
 * Verify password against Argon2id hash
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    if (!hash || typeof hash !== 'string' || !plain) return false;
    return await argon2.verify(hash, plain);
  } catch (err) {
    return false;
  }
}

/**
 * Generate cryptographically random opaque token (hex)
 */
export function generateRandomToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash arbitrary token using SHA-256 for secure database storage
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
