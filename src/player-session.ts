import { createHash, randomBytes } from "node:crypto";

const PLAYER_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const createPlayerSessionToken = (): string => randomBytes(32).toString("base64url");

export const hashPlayerSessionToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

export const readPlayerSessionToken = (authorization: string | undefined): string | undefined => {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i);
  return match && PLAYER_SESSION_TOKEN_PATTERN.test(match[1] ?? "") ? match[1] : undefined;
};
