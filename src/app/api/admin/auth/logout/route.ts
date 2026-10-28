import { NextResponse, type NextRequest } from "next/server";
import { authenticateAdmin, COOKIE_NAME_AUTH, COOKIE_NAME_CSRF } from "@/lib/auth-server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateAdmin(req, { checkCsrf: false });

    // If valid session, revoke all active tokens by bumping tokenVersion
    if (auth.success) {
      await adminDb.revokeAdminSessions(auth.user.id);
    }

    const response = NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });

    const isProduction = process.env.NODE_ENV === "production";

    // Expire Auth Cookie
    response.cookies.set({
      name: COOKIE_NAME_AUTH,
      value: "",
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    // Expire CSRF Cookie
    response.cookies.set({
      name: COOKIE_NAME_CSRF,
      value: "",
      httpOnly: false,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (err: unknown) {
    console.error("[Admin Logout Error]:", err);
    return NextResponse.json({ error: "Failed to log out cleanly" }, { status: 500 });
  }
}
