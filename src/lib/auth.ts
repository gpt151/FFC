import crypto from "crypto";
import { cookies } from "next/headers";

export const USER_COOKIE_NAME = "lyt_rp_user";
export const ADMIN_COOKIE_NAME = "lyt_rp_admin";

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "lyt-redpacket-dev-fallback-secret-change-in-prod"
  );
}

export function getAdminPassword(): string {
  if (process.env.ADMIN_PASSWORD) {
    return process.env.ADMIN_PASSWORD;
  }
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    return "";
  }
  return "admin123456";
}

export function isUsingDefaultDevAdminPassword(): boolean {
  return !process.env.ADMIN_PASSWORD && process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production";
}

export function hashPassphrase(passphrase: string): string {
  return crypto.createHash("sha256").update(passphrase.trim()).digest("hex");
}

function signPayload(payloadB64: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadB64)
    .digest("base64url");
}

export function encodeSignedToken(data: Record<string, unknown>, ttlSeconds = 86400 * 7): string {
  const payload = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function decodeSignedToken<T extends Record<string, unknown>>(token: string | undefined): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = signPayload(payloadB64);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as T & {
      exp?: number;
    };
    if (parsed.exp && parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export interface UserSession {
  userId: number;
  email: string;
}

export async function getUserSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(USER_COOKIE_NAME)?.value;
  const parsed = decodeSignedToken<{ userId: number; email: string }>(raw);
  if (!parsed?.email) return null;
  return { userId: parsed.userId, email: parsed.email };
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const parsed = decodeSignedToken<{ role: string }>(raw);
  return parsed?.role === "admin";
}
