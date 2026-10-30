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

    const adTypeParam = searchParams.get("type") || searchParams.get("adType");
    const isStaticParam = searchParams.get("isStatic");
    const staticTypeParam = searchParams.get("staticType");
    const formatParam = searchParams.get("format");
    const countParam = parseInt(searchParams.get("count") || "3", 10);
    const maxCount = Math.max(1, Math.min(isNaN(countParam) ? 3 : countParam, 10));

    let adTypeFilter: "banner" | "product" | "popup" | undefined = undefined;
    if (adTypeParam === "popup" || formatParam === "drawer") {
      adTypeFilter = "popup";
    } else if (adTypeParam === "banner") {
      adTypeFilter = "banner";
    } else if (adTypeParam === "product" || adTypeParam === "product_card") {
      adTypeFilter = "product";
    }

    let isStaticFilter: boolean | undefined = undefined;
    if (formatParam === "drawer" || isStaticParam === "false") {
      isStaticFilter = false;
    } else if (formatParam === "static" || isStaticParam === "true") {
      isStaticFilter = true;
    }

    let staticTypeFilter: "banner" | "product_card" | undefined = undefined;
    if (staticTypeParam === "banner") {
      staticTypeFilter = "banner";
    } else if (staticTypeParam === "product_card" || staticTypeParam === "product") {
      staticTypeFilter = "product_card";
    }

    const { ad, ads } = await adminDb.getServedAdsForPage(
      page as AllowedTargetPage,
      seed,
      maxCount,
      excludeIds,
      {
        adType: adTypeFilter,
        isStatic: isStaticFilter,
        staticType: staticTypeFilter,
      },
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
