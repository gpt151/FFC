import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getPlatformSettings, isPostgresConfigured, updatePlatformSettings } from "./db";

export const USER_COOKIE_NAME = "lyt_rp_user";
export const ADMIN_COOKIE_NAME = "lyt_rp_admin";

let cachedDbSessionSecret: string | null = null;

export function getRequestOrigin(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/+$/, "");
  }
  const protoHeader = req.headers.get("x-forwarded-proto");
  const proto = protoHeader ? protoHeader.split(",")[0].trim() : req.nextUrl.protocol.replace(":", "") || "https";
  const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (hostHeader) {
    return `${proto}://${hostHeader.split(",")[0].trim()}`;
  }
  return req.nextUrl.origin;
}

/**
 * Extracts client IP behind Vercel / reverse-proxy headers.
 */
export function getClientIp(req: NextRequest): string {
  const candidates = [
    req.headers.get("x-vercel-forwarded-for"),
    req.headers.get("x-forwarded-for"),
    req.headers.get("cf-connecting-ip"),
    req.headers.get("x-real-ip"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const first = raw.split(",")[0].trim();
    if (!first) continue;
    return first.startsWith("::ffff:") ? first.slice(7) : first;
  }
  return "unknown";
}

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    cachedDbSessionSecret ||
    process.env.ADMIN_PASSWORD ||
    "lyt-redpacket-dev-fallback-secret-change-in-prod"
  );
}

/**
 * Resolves the HMAC signing secret with PostgreSQL persistence so stateless
 * serverless instances share one secret even without a SESSION_SECRET env var.
 */
export async function getResolvedSessionSecret(): Promise<string> {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }
  if (cachedDbSessionSecret) {
    return cachedDbSessionSecret;
  }
  try {
    const settings = await getPlatformSettings();
    if (settings.session_secret) {
      cachedDbSessionSecret = settings.session_secret;
      return settings.session_secret;
    }
    if (isPostgresConfigured()) {
      const generated = crypto.randomBytes(32).toString("hex");
      await updatePlatformSettings({ session_secret: generated });
      cachedDbSessionSecret = generated;
      return generated;
    }
  } catch {
    // Fall back gracefully if settings cannot be queried yet.
  }
  return process.env.ADMIN_PASSWORD || "lyt-redpacket-dev-fallback-secret-change-in-prod";
}

export function clearCachedSessionSecret(): void {
  cachedDbSessionSecret = null;
}

export function hashAdminPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyAdminPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const [, salt, hashHex] = parts;
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
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

export interface AdminAuthConfig {
  mode: "env" | "db" | "dev" | "unconfigured";
  envPassword?: string;
  dbHash?: string;
}

export async function getAdminAuthConfig(): Promise<AdminAuthConfig> {
  if (process.env.ADMIN_PASSWORD) {
    return { mode: "env", envPassword: process.env.ADMIN_PASSWORD };
  }
  try {
    const settings = await getPlatformSettings();
    if (settings.admin_password_hash) {
      return { mode: "db", dbHash: settings.admin_password_hash };
    }
  } catch {
    // Ignore DB errors when checking setup state; fall back to env/dev checks.
  }
  if (isUsingDefaultDevAdminPassword()) {
    return { mode: "dev", envPassword: "admin123456" };
  }
  return { mode: "unconfigured" };
}

export function hashPassphrase(passphrase: string): string {
  return crypto.createHash("sha256").update(passphrase.trim()).digest("hex");
}

function signPayload(payloadB64: string, secretOverride?: string): string {
  return crypto
    .createHmac("sha256", secretOverride || getSessionSecret())
    .update(payloadB64)
    .digest("base64url");
}

export function encodeSignedToken(
  data: Record<string, unknown>,
  ttlSeconds = 86400 * 7,
  secretOverride?: string
): string {
  const payload = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signPayload(payloadB64, secretOverride);
  return `${payloadB64}.${sig}`;
}

export function decodeSignedToken<T extends Record<string, unknown>>(
  token: string | undefined,
  secretOverride?: string
): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = signPayload(payloadB64, secretOverride);
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
  const secret = await getResolvedSessionSecret();
  const parsed = decodeSignedToken<{ userId: number; email: string }>(raw, secret);
  if (!parsed?.email) return null;
  return { userId: parsed.userId, email: parsed.email };
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const secret = await getResolvedSessionSecret();
  const parsed = decodeSignedToken<{ role: string }>(raw, secret);
  return parsed?.role === "admin";
}
