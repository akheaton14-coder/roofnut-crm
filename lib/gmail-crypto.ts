import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function secretBuffer(name: "GMAIL_TOKEN_ENCRYPTION_KEY" | "GMAIL_STATE_SECRET") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return createHmac("sha256", name).update(value).digest();
}

export function encryptGmailToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretBuffer("GMAIL_TOKEN_ENCRYPTION_KEY"), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptGmailToken(value: string) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", secretBuffer("GMAIL_TOKEN_ENCRYPTION_KEY"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function createGmailState(userId: string) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    expiresAt: Date.now() + 10 * 60 * 1000,
    nonce: randomBytes(18).toString("base64url"),
  })).toString("base64url");
  const signature = createHmac("sha256", secretBuffer("GMAIL_STATE_SECRET")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyGmailState(state: string, expectedUserId: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", secretBuffer("GMAIL_STATE_SECRET")).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId: string; expiresAt: number };
  return parsed.userId === expectedUserId && parsed.expiresAt > Date.now();
}
