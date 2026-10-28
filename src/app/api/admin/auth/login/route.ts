import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  checkRateLimit,
  COOKIE_NAME_AUTH,
  COOKIE_NAME_CSRF,
  generateCsrfToken,
  signAdminToken,
  verifyPassword,
} from "@/lib/auth-server";
import { adminDb } from "@/lib/firebase-admin";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limiting by IP (max 5 attempts in prod, 50 in dev)
    const ip =
      req.headers.get("x-client-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "local";
    const maxAttempts = process.env.NODE_ENV === "production" ? 5 : 50;
    const rateCheck = checkRateLimit(`login_${ip}`, maxAttempts, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait 15 minutes before trying again." },
        { status: 429 },
      );
    }

    // 2. Validate input
    const body = await req.json().catch(() => ({}));
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Valid email and password are required" }, { status: 400 });
    }

    const { email, password } = parsed.data;

    // 3. Find user
    const user = await adminDb.getAdminUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // 4. Verify password
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // 5. Update last login
    await adminDb.updateAdminUser(user.id, {
      lastLoginAt: new Date().toISOString(),
    });

    // 6. Sign JWT
    const token = await signAdminToken(user);
    const csrfToken = generateCsrfToken();

    // 7. Create response and set secure cookies
    const response = NextResponse.json({
      success: true,
      message: "Authentication successful",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      csrfToken,
    });

    const isProduction = process.env.NODE_ENV === "production";
    const maxAgeSeconds = 24 * 60 * 60; // 24 hours

    // HttpOnly Auth Cookie
    response.cookies.set({
      name: COOKIE_NAME_AUTH,
      value: token,
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    });

    // CSRF Cookie
    response.cookies.set({
      name: COOKIE_NAME_CSRF,
      value: csrfToken,
      httpOnly: false,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    });

    return response;
  } catch (err: unknown) {
    console.error("[Admin Login Error]:", err);
    return NextResponse.json(
      { error: "Internal server error occurred during login" },
      { status: 500 },
    );
  }
}
