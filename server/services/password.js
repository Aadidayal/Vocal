import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  });

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password, encodedHash) {
  const [algorithm, cost, blockSize, parallelization, encodedSalt, encodedKey] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedKey) return false;

  const expected = Buffer.from(encodedKey, "base64url");
  const salt = Buffer.from(encodedSalt, "base64url");
  const derivedKey = await scrypt(password, salt, expected.length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization),
    maxmem: MAX_MEMORY,
  });

  return expected.length === derivedKey.length && timingSafeEqual(expected, derivedKey);
}
