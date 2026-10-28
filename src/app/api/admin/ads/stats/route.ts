import { NextResponse, type NextRequest } from "next/server";
import { authenticateAdmin } from "@/lib/auth-server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateAdmin(req, { checkCsrf: false });
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const stats = await adminDb.getStats();

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (err: unknown) {
    console.error("[Admin Ads Stats Error]:", err);
    return NextResponse.json({ error: "Failed to load ad statistics" }, { status: 500 });
  }
}
