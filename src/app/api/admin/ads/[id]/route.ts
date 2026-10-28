import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAdmin } from "@/lib/auth-server";
import { adminDb } from "@/lib/firebase-admin";
import { deleteUploadedMedia } from "@/lib/storage-client";

const ALLOWED_TARGET_PAGES = ["/", "/settle/[id]", "/history"] as const;

const adUpdateSchema = z.object({
  title: z.string().min(1, "Ad title is required").max(100).optional(),
  description: z.string().max(500).optional(),
  mediaType: z.enum(["image", "video"]).optional(),
  mediaUrl: z.string().url().optional(),
  storagePath: z.string().min(1).optional(),
  mediaWidth: z.number().positive().optional(),
  mediaHeight: z.number().positive().optional(),
  aspectRatio: z.string().optional(),
  targetPages: z
    .array(z.string())
    .min(1)
    .refine(
      (pages) => pages.every((p) => (ALLOWED_TARGET_PAGES as readonly string[]).includes(p)),
      "Invalid target page. Supported pages: '/', '/settle/[id]', '/history'",
    )
    .optional(),
  isActive: z.boolean().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  clickUrl: z.string().url().nullable().optional().or(z.literal("")),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateAdmin(req, { checkCsrf: false });
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const ad = await adminDb.getAdById(id);
    if (!ad) {
      return NextResponse.json({ error: "Ad not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ad });
  } catch (err: unknown) {
    console.error("[Admin Get Ad Error]:", err);
    return NextResponse.json({ error: "Failed to retrieve ad" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const body = await req.json().catch(() => ({}));
    const parsed = adUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input" },
        { status: 400 },
      );
    }

    const updates = parsed.data;

    // Check date order
    const startDate = updates.startDate !== undefined ? updates.startDate : existing.startDate;
    const endDate = updates.endDate !== undefined ? updates.endDate : existing.endDate;
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      return NextResponse.json({ error: "End date must be after start date" }, { status: 400 });
    }

    // If media storage path was changed, clean up previous file if unreferenced
    if (updates.storagePath && updates.storagePath !== existing.storagePath) {
      const isOldStillUsed = await adminDb.isStoragePathUsed(existing.storagePath, id);
      if (!isOldStillUsed && existing.storagePath) {
        await deleteUploadedMedia(existing.storagePath);
      }
    }

    const updated = await adminDb.updateAd(id, updates);

    return NextResponse.json({
      success: true,
      message: "Ad updated successfully",
      ad: updated,
    });
  } catch (err: unknown) {
    console.error("[Admin Update Ad Error]:", err);
    return NextResponse.json({ error: "Failed to update ad" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    // Delete from Firestore
    await adminDb.deleteAd(id);

    // Clean up Firebase Storage media if not referenced by any other ad
    if (existing.storagePath) {
      const isUsedElsewhere = await adminDb.isStoragePathUsed(existing.storagePath, id);
      if (!isUsedElsewhere) {
        await deleteUploadedMedia(existing.storagePath);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Ad deleted and associated media cleaned up successfully",
    });
  } catch (err: unknown) {
    console.error("[Admin Delete Ad Error]:", err);
    return NextResponse.json({ error: "Failed to delete ad" }, { status: 500 });
  }
}
