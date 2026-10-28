import { NextResponse, type NextRequest } from "next/server";
import { authenticateAdmin } from "@/lib/auth-server";
import { adminDb } from "@/lib/firebase-admin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateAdmin(req, { checkCsrf: true });
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const existing = await adminDb.getAdById(id);
    if (!existing) {
      return NextResponse.json({ error: "Ad not found" }, { status: 404 });
    }

    const nextState = !existing.isActive;
    const updated = await adminDb.updateAd(id, { isActive: nextState });

    return NextResponse.json({
      success: true,
      message: `Ad ${nextState ? "activated" : "deactivated"} successfully`,
      isActive: nextState,
      ad: updated,
    });
  } catch (err: unknown) {
    console.error("[Admin Toggle Ad Error]:", err);
    return NextResponse.json({ error: "Failed to toggle ad status" }, { status: 500 });
  }
}
