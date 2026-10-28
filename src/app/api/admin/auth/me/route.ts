import { NextResponse, type NextRequest } from "next/server";
import { authenticateAdmin } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateAdmin(req, { checkCsrf: false });
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { user } = auth;
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt || null,
      },
    });
  } catch (err: unknown) {
    console.error("[Admin Me Error]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
