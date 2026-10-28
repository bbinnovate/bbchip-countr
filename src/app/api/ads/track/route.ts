import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};
    const { adId, event } = body;

    if (!adId || typeof adId !== "string") {
      return NextResponse.json({ error: "Missing or invalid adId" }, { status: 400 });
    }

    if (event !== "view" && event !== "click") {
      return NextResponse.json(
        { error: "Invalid event. Must be 'view' or 'click'" },
        { status: 400 },
      );
    }

    if (event === "view") {
      await adminDb.recordAdView(adId);
    } else {
      await adminDb.recordAdClick(adId);
    }

    return NextResponse.json({
      success: true,
      adId,
      event,
    });
  } catch (error) {
    console.error("Ad tracking error:", error);
    return NextResponse.json({ error: "Failed to track ad event" }, { status: 500 });
  }
}
