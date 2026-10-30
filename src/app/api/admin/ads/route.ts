import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAdmin } from "@/lib/auth-server";
import { adminDb, ALLOWED_TARGET_PAGES, type AdType, type MediaType } from "@/lib/firebase-admin";

const adCreateSchema = z.object({
  title: z.string().min(1, "Ad title is required").max(100, "Title is too long"),
  description: z.string().max(500, "Description is too long").optional(),
  adType: z.enum(["banner", "product", "popup"]).default("banner"),
  mediaType: z.enum(["image", "video"]),
  mediaUrl: z.string().url("Valid media URL is required"),
  storagePath: z.string().min(1, "Storage path is required"),
  mediaWidth: z.number().positive().optional(),
  mediaHeight: z.number().positive().optional(),
  aspectRatio: z.string().optional(),
  targetPages: z
    .array(z.string())
    .min(1, "At least one target page must be selected")
    .refine(
      (pages) => pages.every((p) => (ALLOWED_TARGET_PAGES as readonly string[]).includes(p)),
      "Invalid target page. Supported pages: '/', '/settle/[id]', '/history'",
    ),
  isActive: z.boolean().default(true),
  isStatic: z.boolean().default(false).optional(),
  staticType: z.enum(["banner", "product_card"]).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  clickUrl: z.string().url("Click URL must be a valid URL").nullable().optional().or(z.literal("")),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateAdmin(req, { checkCsrf: false });
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const statusParam = searchParams.get("status");
    const mediaTypeParam = searchParams.get("mediaType");
    const adTypeParam = searchParams.get("adType");
    const targetPageParam = searchParams.get("targetPage");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10", 10)));

    const isActive =
      statusParam === "active" ? true : statusParam === "inactive" ? false : undefined;
    const mediaType =
      mediaTypeParam === "image" || mediaTypeParam === "video"
        ? (mediaTypeParam as MediaType)
        : undefined;
    const adType =
      adTypeParam === "banner" || adTypeParam === "product" || adTypeParam === "popup"
        ? (adTypeParam as AdType)
        : undefined;
    const targetPage = targetPageParam && targetPageParam !== "all" ? targetPageParam : undefined;

    const offset = (page - 1) * limit;

    const { ads, total } = await adminDb.listAds({
      search,
      isActive,
      mediaType,
      adType,
      targetPage,
      limit,
      offset,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return NextResponse.json({
      success: true,
      ads,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (err: unknown) {
    console.error("[Admin List Ads Error]:", err);
    return NextResponse.json({ error: "Failed to list ads" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateAdmin(req, { checkCsrf: true });
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = adCreateSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input" },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Date range validation if both start and end are provided
    if (data.startDate && data.endDate) {
      if (new Date(data.endDate) <= new Date(data.startDate)) {
        return NextResponse.json({ error: "End date must be after start date" }, { status: 400 });
      }
    }

    const adType =
      data.adType ||
      (data.isStatic ? (data.staticType === "product_card" ? "product" : "banner") : "popup");
    const isStatic = adType !== "popup";
    const staticType =
      adType === "product" ? "product_card" : adType === "banner" ? "banner" : null;

    const newAd = await adminDb.createAd({
      title: data.title,
      description: data.description || "",
      adType,
      mediaType: data.mediaType,
      mediaUrl: data.mediaUrl,
      storagePath: data.storagePath,
      mediaWidth: data.mediaWidth,
      mediaHeight: data.mediaHeight,
      aspectRatio: data.aspectRatio,
      targetPages: data.targetPages,
      isActive: data.isActive,
      isStatic,
      staticType,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      clickUrl: data.clickUrl || null,
      createdBy: auth.user.email,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Ad created successfully in Firestore",
        ad: newAd,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    console.error("[Admin Create Ad Error]:", err);
    return NextResponse.json({ error: "Failed to create ad" }, { status: 500 });
  }
}
