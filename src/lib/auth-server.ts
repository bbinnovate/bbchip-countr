import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { adminDb, type AdminRole, type AdminUser } from "@/lib/firebase-admin";

const JWT_SECRET =
  process.env.JWT_SECRET || "ledger_default_fallback_jwt_secret_must_be_set_in_env";
const JWT_ISSUER = "ledger-ads";
const JWT_AUDIENCE = "ledger-admin";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "24h";

export const COOKIE_NAME_AUTH = "ledger_admin_token";
export const COOKIE_NAME_CSRF = "ledger_csrf_token";

export interface AdminTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: AdminRole;
  tokenVersion: number;
}

// ---------------------------------------------------------------
// Password Hashing (Bcrypt with 12 rounds)
// ---------------------------------------------------------------
export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plain, salt);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ---------------------------------------------------------------
// JWT Token Signing & Verification (jose)
// ---------------------------------------------------------------
function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(JWT_SECRET);
}

export async function signAdminToken(user: AdminUser): Promise<string> {
  const secret = getSecretKey();
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    tokenVersion: user.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(secret);

  return token;
}

export async function verifyAdminToken(token: string): Promise<AdminTokenPayload | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (!payload.sub || typeof payload.email !== "string") {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "",
      role: (payload.role as AdminRole) || "admin",
      tokenVersion: typeof payload.tokenVersion === "number" ? payload.tokenVersion : 0,
    };
  } catch (err) {
    return null;
  }
}

// ---------------------------------------------------------------
// In-Memory Rate Limiter (sliding window per IP/key)
// ---------------------------------------------------------------
interface RateLimitRecord {
  attempts: number[];
}

const rateLimitMap = new Map<string, RateLimitRecord>();

export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const record = rateLimitMap.get(key) || { attempts: [] };

  // Remove timestamps outside the sliding window
  record.attempts = record.attempts.filter((ts) => now - ts < windowMs);

  if (record.attempts.length >= maxAttempts) {
    const oldest = record.attempts[0] ?? now;
    const resetMs = windowMs - (now - oldest);
    return { allowed: false, remaining: 0, resetMs: Math.max(0, resetMs) };
  }

  record.attempts.push(now);
  rateLimitMap.set(key, record);

  return {
    allowed: true,
    remaining: maxAttempts - record.attempts.length,
    resetMs: windowMs,
  };
}

// ---------------------------------------------------------------
// CSRF Token Generation & Verification
// ---------------------------------------------------------------
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function verifyCsrf(req: Request): boolean {
  // If request uses Bearer token authorization header (Postman / API client), bypass CSRF
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return true;
  }

  // Safe HTTP methods don't require CSRF checks
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return true;
  }

  const headerToken = req.headers.get("x-csrf-token");
  if (!headerToken) return false;

  // Extract csrf cookie from Cookie header
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|; )${COOKIE_NAME_CSRF}=([^;]*)`));
  const cookieToken = match && match[1] ? decodeURIComponent(match[1]) : null;

  return !!cookieToken && cookieToken === headerToken;
}

// ---------------------------------------------------------------
// Session & Role Authorization Guard
// ---------------------------------------------------------------
export async function authenticateAdmin(
  req: Request | NextRequest,
  options: { requiredRole?: AdminRole; checkCsrf?: boolean } = {},
): Promise<
  { success: true; user: AdminUser } | { success: false; status: 401 | 403; error: string }
> {
  const { requiredRole, checkCsrf = true } = options;

  // CSRF validation for state-changing requests
  if (checkCsrf && !verifyCsrf(req)) {
    return { success: false, status: 403, error: "Invalid or missing CSRF token" };
  }

  // Extract token from Authorization header or HttpOnly cookie
  let token: string | null = null;
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else {
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`(?:^|; )${COOKIE_NAME_AUTH}=([^;]*)`));
    if (match && match[1]) {
      token = decodeURIComponent(match[1]);
    }
  }

  if (!token) {
    return { success: false, status: 401, error: "Authentication required" };
  }

  // Verify JWT
  const payload = await verifyAdminToken(token);
  if (!payload) {
    return { success: false, status: 401, error: "Invalid or expired token" };
  }

  // Verify user still exists in database and tokenVersion matches
  const user = await adminDb.getAdminUserById(payload.sub);
  if (!user) {
    return { success: false, status: 401, error: "User no longer exists" };
  }

  if (user.tokenVersion !== payload.tokenVersion) {
    return { success: false, status: 401, error: "Session has been revoked. Please log in again." };
  }

  // Role check
  if (requiredRole && user.role !== requiredRole && user.role !== "superadmin") {
    return { success: false, status: 403, error: "Forbidden: Insufficient privileges" };
  }

  return { success: true, user };
}

// Helper for server components
export async function getAdminSessionFromCookies(): Promise<AdminUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME_AUTH)?.value;
    if (!token) return null;

    const payload = await verifyAdminToken(token);
    if (!payload) return null;

    const user = await adminDb.getAdminUserById(payload.sub);
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}
