import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const algorithm = "scrypt-v1";
const cost = 2 ** 15;
const blockSize = 8;
const parallelization = 1;
const keyLength = 64;
const saltLength = 16;
const maximumPasswordBytes = 1024;
export const minimumPasswordLength = 12;

export class PasswordValidationError extends Error {
  constructor(readonly code: "PASSWORD_TOO_LONG" | "PASSWORD_TOO_SHORT") {
    super(
      code === "PASSWORD_TOO_SHORT"
        ? `Use at least ${minimumPasswordLength} characters for your password.`
        : "Please use a shorter password.",
    );
    this.name = "PasswordValidationError";
  }
}

function validatePasswordValue(password: string): void {
  if (password.length < minimumPasswordLength) {
    throw new PasswordValidationError("PASSWORD_TOO_SHORT");
  }
  if (Buffer.byteLength(password, "utf8") > maximumPasswordBytes) {
    throw new PasswordValidationError("PASSWORD_TOO_LONG");
  }
}

export function validatePassword(password: string): void {
  validatePasswordValue(password);
}

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      {
        blockSize,
        cost,
        maxmem: 64 * 1024 * 1024,
        parallelization,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(Buffer.from(derivedKey));
      },
    );
  });
}

/**
 * Uses Node's memory-hard scrypt implementation rather than a reversible or
 * fast hash. The versioned format enables a future transparent upgrade.
 */
export async function hashPassword(password: string): Promise<string> {
  validatePasswordValue(password);
  const salt = randomBytes(saltLength);
  const derivedKey = await deriveKey(password, salt);
  return [
    algorithm,
    String(cost),
    String(blockSize),
    String(parallelization),
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

type ParsedHash = {
  derivedKey: Buffer;
  salt: Buffer;
};

function parsePasswordHash(encoded: string): ParsedHash | null {
  const [
    encodedAlgorithm,
    encodedCost,
    encodedBlockSize,
    encodedParallelization,
    encodedSalt,
    encodedKey,
    ...unexpected
  ] = encoded.split("$");

  if (
    unexpected.length > 0 ||
    encodedAlgorithm !== algorithm ||
    encodedCost !== String(cost) ||
    encodedBlockSize !== String(blockSize) ||
    encodedParallelization !== String(parallelization) ||
    !encodedSalt ||
    !encodedKey
  ) {
    return null;
  }

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const derivedKey = Buffer.from(encodedKey, "base64url");
    if (salt.length !== saltLength || derivedKey.length !== keyLength) return null;
    return { derivedKey, salt };
  } catch {
    return null;
  }
}

/** Returns false for malformed hashes without leaking parsing details. */
export async function verifyPasswordHash(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  if (Buffer.byteLength(password, "utf8") > maximumPasswordBytes) return false;
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return false;

  const candidate = await deriveKey(password, parsed.salt);
  return timingSafeEqual(candidate, parsed.derivedKey);
}
