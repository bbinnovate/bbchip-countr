import { NextResponse, type NextRequest } from "next/server";
import { adminDb, ALLOWED_TARGET_PAGES, type AllowedTargetPage } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page");
    const seed = searchParams.get("seed") || undefined;
    const excludeParam = searchParams.get("exclude");
    const excludeIds = excludeParam
      ? excludeParam
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : [];

    if (!page) {
      return NextResponse.json(
        {
          error:
            "Missing required 'page' parameter. Supported values: '/', '/settle/[id]', '/history'",
        },
        { status: 400 },
      );
    }

    if (!(ALLOWED_TARGET_PAGES as readonly string[]).includes(page)) {
      return NextResponse.json(
        {
          error: `Invalid target page '${page}'. Supported values: '/', '/settle/[id]', '/history'`,
        },
        { status: 400 },
      );
    }

    const { ad, ads } = await adminDb.getServedAdsForPage(
      page as AllowedTargetPage,
      seed,
      3,
      excludeIds,
    );

    return NextResponse.json(
      { ad, ads },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    console.error("Ad delivery API error:", error);
    return NextResponse.json({ error: "Internal server error delivering ad" }, { status: 500 });
  }
}
