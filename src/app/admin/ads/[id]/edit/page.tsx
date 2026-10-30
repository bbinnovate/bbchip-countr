"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  ExternalLink,
  Eye,
  Film,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  MousePointerClick,
  Sparkles,
  Trash2,
  TrendingUp,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { UploadTask } from "firebase/storage";
import { cn } from "@/lib/utils";
import {
  compressImage,
  deleteUploadedMedia,
  detectMediaDimensions,
  startMediaUpload,
  TARGET_IMAGE_SIZE_BYTES,
  validateMediaFile,
  type MediaUploadResult,
} from "@/lib/storage-client";
import type { Ad, AdType } from "@/lib/firebase-admin";

const TARGET_PAGE_OPTIONS = [
  { id: "/", label: "Home Page", path: "/" },
  { id: "/settle/[id]", label: "Settlement Page", path: "/settle/[id]" },
  { id: "/history", label: "History Page", path: "/history" },
];

export default function EditAdPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [ad, setAd] = useState<Ad | null>(null);

  // Form State
  const [adType, setAdType] = useState<AdType>("banner");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetPages, setTargetPages] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [clickUrl, setClickUrl] = useState("");

  // Existing Media State
  const [currentMediaUrl, setCurrentMediaUrl] = useState("");
  const [currentStoragePath, setCurrentStoragePath] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [mediaWidth, setMediaWidth] = useState<number | undefined>();
  const [mediaHeight, setMediaHeight] = useState<number | undefined>();
  const [aspectRatio, setAspectRatio] = useState<string | undefined>();

  // Replacement Media State (local preview before submit)
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementPreviewUrl, setReplacementPreviewUrl] = useState<string | null>(null);
  const [replacementMediaType, setReplacementMediaType] = useState<"image" | "video">("image");
  const [replacementWidth, setReplacementWidth] = useState<number | undefined>();
  const [replacementHeight, setReplacementHeight] = useState<number | undefined>();
  const [replacementAspectRatio, setReplacementAspectRatio] = useState<string | undefined>();
  const [replacementSizeBytes, setReplacementSizeBytes] = useState<number>(0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadTask, setUploadTask] = useState<UploadTask | null>(null);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cleanup replacement object URL on unmount or change
  useEffect(() => {
    return () => {
      if (replacementPreviewUrl) {
        URL.revokeObjectURL(replacementPreviewUrl);
      }
    };
  }, [replacementPreviewUrl]);

  useEffect(() => {
    fetch(`/api/admin/ads/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Ad not found");
        return res.json();
      })
      .then((data) => {
        const item: Ad = data.ad;
        setAd(item);
        setTitle(item.title);
        setDescription(item.description || "");
        setTargetPages(item.targetPages || []);
        setIsActive(item.isActive);
        setAdType(
          item.adType ||
            (item.isStatic ? (item.staticType === "product_card" ? "product" : "banner") : "popup"),
        );
        setCurrentMediaUrl(item.mediaUrl);
        setCurrentStoragePath(item.storagePath);
        setMediaType(item.mediaType);
        setMediaWidth(item.mediaWidth);
        setMediaHeight(item.mediaHeight);
        setAspectRatio(item.aspectRatio);
        setClickUrl(item.clickUrl || "");

        if (item.startDate) {
          const d = new Date(item.startDate);
          setStartDate(
            new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
          );
        }
        if (item.endDate) {
          const d = new Date(item.endDate);
          setEndDate(
            new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
          );
        }
      })
      .catch((err) => {
        toast.error("Failed to fetch ad details");
        router.push("/admin/ads");
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    // Reset input value so re-selecting triggers change
    e.target.value = "";

    const validation = validateMediaFile(rawFile);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    let file = rawFile;
    if (file.type.startsWith("image/") && file.size > TARGET_IMAGE_SIZE_BYTES) {
      const toastId = toast.loading(
        `Compressing image (${(rawFile.size / (1024 * 1024)).toFixed(1)} MB) to under 1 MB...`,
      );
      try {
        file = await compressImage(file, TARGET_IMAGE_SIZE_BYTES);
        toast.success(
          `Image compressed: ${(rawFile.size / (1024 * 1024)).toFixed(1)} MB → ${(file.size / (1024 * 1024)).toFixed(2)} MB`,
          { id: toastId },
        );
      } catch (err) {
        toast.dismiss(toastId);
        console.warn("Failed to auto-compress image:", err);
      }
    }

    if (replacementPreviewUrl) {
      URL.revokeObjectURL(replacementPreviewUrl);
    }

    const localUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    setReplacementFile(file);
    setReplacementPreviewUrl(localUrl);
    setReplacementMediaType(isVideo ? "video" : "image");
    setReplacementSizeBytes(file.size);
    setError(null);

    try {
      const dimensions = await detectMediaDimensions(file);
      setReplacementWidth(dimensions.width);
      setReplacementHeight(dimensions.height);
      setReplacementAspectRatio(dimensions.aspectRatio);
    } catch (err) {
      console.warn("Failed to detect replacement media dimensions:", err);
    }
  };

  const handleCancelReplacement = () => {
    if (replacementPreviewUrl) {
      URL.revokeObjectURL(replacementPreviewUrl);
    }
    setReplacementFile(null);
    setReplacementPreviewUrl(null);
    setReplacementWidth(undefined);
    setReplacementHeight(undefined);
    setReplacementAspectRatio(undefined);
    setReplacementSizeBytes(0);
  };

  const toggleTargetPage = (pageId: string) => {
    setTargetPages((prev) =>
      prev.includes(pageId) ? prev.filter((p) => p !== pageId) : [...prev, pageId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Ad title is required");
      return;
    }

    if (targetPages.length === 0) {
      setError("Please select at least one target page");
      return;
    }

    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      setError("End date must be after start date");
      return;
    }

    setSubmitting(true);
    let uploadedResult: MediaUploadResult | null = null;

    try {
      let finalMediaUrl = currentMediaUrl;
      let finalStoragePath = currentStoragePath;
      let finalMediaType = mediaType;
      let finalWidth = mediaWidth;
      let finalHeight = mediaHeight;
      let finalAspectRatio = aspectRatio;

      // Only upload to Firebase Storage if a new replacement file was selected
      if (replacementFile) {
        setUploadProgress(0);
        const { task, promise } = startMediaUpload(replacementFile, (pct) => {
          setUploadProgress(pct);
        });
        setUploadTask(task);

        uploadedResult = await promise;
        finalMediaUrl = uploadedResult.downloadUrl;
        finalStoragePath = uploadedResult.storagePath;
        finalMediaType = uploadedResult.mediaType;
        finalWidth = uploadedResult.width;
        finalHeight = uploadedResult.height;
        finalAspectRatio = uploadedResult.aspectRatio;
      }

      const match = document.cookie.match(/(?:^|; )ledger_csrf_token=([^;]*)/);
      const csrfToken = match && match[1] ? decodeURIComponent(match[1]) : "";

      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        adType,
        mediaType: finalMediaType,
        mediaUrl: finalMediaUrl,
        storagePath: finalStoragePath,
        mediaWidth: finalWidth,
        mediaHeight: finalHeight,
        aspectRatio: finalAspectRatio,
        targetPages,
        isActive,
        isStatic: adType !== "popup",
        staticType: adType === "product" ? "product_card" : adType === "banner" ? "banner" : null,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
        clickUrl: clickUrl.trim() || null,
      };

      const res = await fetch(`/api/admin/ads/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update ad");
      }

      // If replacement file was uploaded and old file existed, delete old file from storage
      if (
        uploadedResult &&
        currentStoragePath &&
        currentStoragePath !== uploadedResult.storagePath
      ) {
        await deleteUploadedMedia(currentStoragePath);
      }

      toast.success("Ad updated successfully in Firestore!");
      router.push("/admin/ads");
    } catch (err: unknown) {
      // If newly uploaded replacement failed to save to Firestore, delete the new file to avoid orphan
      if (uploadedResult?.storagePath) {
        await deleteUploadedMedia(uploadedResult.storagePath);
      }

      const isCanceled =
        typeof err === "object" && err !== null && "code" in err && err.code === "storage/canceled";
      if (isCanceled) {
        toast.info("Upload canceled");
      } else {
        const msg = err instanceof Error ? err.message : "Error updating ad";
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
      setUploadTask(null);
    }
  };

  const activeMediaUrl = replacementPreviewUrl || currentMediaUrl;
  const activeMediaType = replacementFile ? replacementMediaType : mediaType;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-xs font-bold uppercase">Loading advertisement details...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/ads"
          className="btn-ghost flex h-8 w-8 items-center justify-center rounded-lg p-0 text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">
            EDIT <span className="gold-text">ADVERTISEMENT</span>
          </h1>
          <p className="text-xs text-muted-foreground">Update ad targeting, media, or schedule.</p>
        </div>
      </div>

      {/* Ad Performance Metrics Summary */}
      {ad && (
        <div className="surface p-4 grid grid-cols-3 gap-3 border border-primary/20">
          <div className="flex flex-col">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <Eye className="h-3 w-3 text-primary" />
              <span>Views</span>
            </span>
            <span className="tabular mt-1 text-xl font-extrabold text-foreground">
              {(ad.views ?? 0).toLocaleString()}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <MousePointerClick className="h-3 w-3 text-primary" />
              <span>Clicks</span>
            </span>
            <span className="tabular mt-1 text-xl font-extrabold text-foreground">
              {(ad.clicks ?? 0).toLocaleString()}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <TrendingUp className="h-3 w-3 text-primary" />
              <span>CTR</span>
            </span>
            <span className="tabular mt-1 text-xl font-extrabold text-primary">
              {ad.views && ad.views > 0
                ? `${(((ad.clicks ?? 0) / ad.views) * 100).toFixed(1)}%`
                : "0.0%"}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Edit Form */}
      <form onSubmit={handleSubmit} className="surface metallic space-y-6 p-6 sm:p-8">
        {/* 1. Ads Type Radio Selection */}
        <div>
          <label className="mb-1 block text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Ads Type <span className="text-primary">*</span>
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            Select the ad placement format. Banner & Product ads appear in page ad slots; Popup ads
            appear in the bottom drawer.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Banner Option */}
            <label
              className={cn(
                "relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all duration-200",
                adType === "banner"
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/40 hover:bg-secondary",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="adType"
                    value="banner"
                    checked={adType === "banner"}
                    onChange={() => setAdType("banner")}
                    className="h-4 w-4 accent-primary cursor-pointer"
                  />
                  <span className="text-sm font-bold text-foreground">Banner</span>
                </div>
                <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-extrabold text-primary uppercase">
                  3:1
                </span>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Wide header/inline banner displayed in{" "}
                <strong className="text-foreground">AdSlot</strong>. Ideal for 1200×400px creatives.
              </p>
            </label>

            {/* Product Option */}
            <label
              className={cn(
                "relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all duration-200",
                adType === "product"
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/40 hover:bg-secondary",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="adType"
                    value="product"
                    checked={adType === "product"}
                    onChange={() => setAdType("product")}
                    className="h-4 w-4 accent-primary cursor-pointer"
                  />
                  <span className="text-sm font-bold text-foreground">Product</span>
                </div>
                <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-extrabold text-primary uppercase">
                  1:1
                </span>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Square featured deal card in <strong className="text-foreground">AdSlot</strong>.
                Ideal for 600×600px product & deal showcases.
              </p>
            </label>

            {/* Popup Option */}
            <label
              className={cn(
                "relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all duration-200",
                adType === "popup"
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/40 hover:bg-secondary",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="adType"
                    value="popup"
                    checked={adType === "popup"}
                    onChange={() => setAdType("popup")}
                    className="h-4 w-4 accent-primary cursor-pointer"
                  />
                  <span className="text-sm font-bold text-foreground">Popup</span>
                </div>
                <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-extrabold text-primary uppercase">
                  Drawer
                </span>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Slide-up floating drawer in <strong className="text-foreground">AdDrawer</strong>{" "}
                with backdrop and dismiss control.
              </p>
            </label>
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-4 border-t border-border pt-6">
          <div>
            <label
              htmlFor="title"
              className="mb-1 block text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Ad Title <span className="text-primary">*</span>
            </label>
            <input
              id="title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-1 block text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Description (Optional)
            </label>
            <textarea
              id="description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3.5 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Current Media Preview & Replacement */}
        <div className="border-t border-border pt-6">
          <label className="mb-2 block text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Creative Media
          </label>

          {/* If replacement is selected, show local replacement preview */}
          {replacementFile && replacementPreviewUrl ? (
            <div className="rounded-xl border border-primary/40 bg-secondary/50 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-black">
                    {replacementMediaType === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={replacementPreviewUrl}
                        alt="Replacement Preview"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <video
                        src={replacementPreviewUrl}
                        className="h-full w-full object-contain"
                        controls
                        muted
                      />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary uppercase">
                        {replacementMediaType}
                      </span>
                      <span className="rounded border border-primary/30 bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                        New Creative Selected
                      </span>
                      {replacementAspectRatio && (
                        <span className="tabular text-xs font-bold text-muted-foreground">
                          Ratio: {replacementAspectRatio}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-foreground truncate max-w-xs">
                      {replacementFile.name}
                    </p>
                    {replacementWidth && replacementHeight && (
                      <p className="tabular text-xs text-muted-foreground">
                        {replacementWidth} × {replacementHeight} px
                      </p>
                    )}
                    <p className="tabular text-[11px] text-muted-foreground">
                      Size: {(replacementSizeBytes / (1024 * 1024)).toFixed(2)} MB · Uploads only on
                      save
                    </p>
                  </div>
                </div>

                {!submitting && (
                  <button
                    type="button"
                    onClick={handleCancelReplacement}
                    className="flex items-center gap-1 text-xs font-bold text-destructive hover:underline cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Cancel Replacement</span>
                  </button>
                )}
              </div>

              {submitting && uploadProgress !== null && (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-2 text-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      Uploading replacement to Firebase Storage...
                    </span>
                    <span className="tabular text-primary">{uploadProgress}%</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-yellow-500 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-secondary/40 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-black">
                    {mediaType === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={currentMediaUrl}
                        alt="Current Creative"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <video
                        src={currentMediaUrl}
                        className="h-full w-full object-contain"
                        controls
                        muted
                      />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary uppercase">
                        {mediaType}
                      </span>
                      {aspectRatio && (
                        <span className="tabular text-xs font-bold text-muted-foreground">
                          Ratio: {aspectRatio}
                        </span>
                      )}
                    </div>
                    {mediaWidth && mediaHeight && (
                      <p className="tabular text-xs text-muted-foreground">
                        {mediaWidth} × {mediaHeight} px
                      </p>
                    )}
                  </div>
                </div>

                {/* Replace Media Button */}
                <div className="relative">
                  <button
                    type="button"
                    disabled={submitting}
                    className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    <UploadCloud className="h-4 w-4" />
                    <span>Replace Media</span>
                  </button>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                    onChange={handleFileSelect}
                    disabled={submitting}
                    className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    aria-label="Replace creative media"
                  />
                </div>
              </div>
            </div>
          )}

          {/* REALISTIC LIVE PREVIEW ACCORDING TO SELECTED AD TYPE */}
          {activeMediaUrl && (
            <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>
                    Live Realistic Preview (
                    {adType === "banner"
                      ? "3:1 Banner"
                      : adType === "product"
                        ? "1:1 Product Card"
                        : "AdDrawer Popup"}
                    )
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Shows exactly how users will see this ad
                </span>
              </div>

              {/* Banner 3:1 Preview */}
              {adType === "banner" && (
                <div className="w-full overflow-hidden rounded-xl border border-primary/25 bg-card shadow-lg transition">
                  <div className="relative aspect-[3/1] w-full overflow-hidden bg-black/40">
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[7px] uppercase tracking-widest text-primary backdrop-blur-sm">
                      <Sparkles className="h-1.5 w-1.5 animate-pulse" />
                      <span>Sponsored</span>
                    </div>
                    {activeMediaType === "video" ? (
                      <video
                        src={activeMediaUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="h-full w-full object-cover object-center"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeMediaUrl}
                        alt="Banner Preview"
                        className="h-full w-full object-cover object-center"
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 bg-secondary/40 p-2.5 sm:px-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-foreground">
                        {title || "Diwali Poker Night Sponsor Banner"}
                      </p>
                      {description && (
                        <p className="truncate text-[10px] text-muted-foreground">{description}</p>
                      )}
                    </div>
                    <span className="btn-gold flex shrink-0 items-center gap-1 px-2.5 py-1 text-[10px] font-extrabold tracking-wider">
                      <span>Learn More</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </span>
                  </div>
                </div>
              )}

              {/* Product 1:1 Preview */}
              {adType === "product" && (
                <div className="max-w-[220px] mx-auto overflow-hidden rounded-xl border border-primary/25 bg-card shadow-lg transition">
                  <div className="relative aspect-square w-full overflow-hidden bg-black/40">
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-primary backdrop-blur-sm">
                      <Sparkles className="h-2.5 w-2.5 animate-pulse" />
                      <span>Featured</span>
                    </div>
                    {activeMediaType === "video" ? (
                      <video
                        src={activeMediaUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="h-full w-full object-cover object-center"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeMediaUrl}
                        alt="Product Preview"
                        className="h-full w-full object-cover object-center"
                      />
                    )}
                  </div>
                  <div className="p-3">
                    <h4 className="truncate text-xs font-bold text-foreground">
                      {title || "Featured Product Name"}
                    </h4>
                    {description && (
                      <p className="line-clamp-2 mt-0.5 text-[10px] text-muted-foreground">
                        {description}
                      </p>
                    )}
                    <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-[10px] font-bold text-primary">
                      <span>View Deal</span>
                      <ExternalLink className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              )}

              {/* Popup (AdDrawer) Preview */}
              {adType === "popup" && (
                <div className="max-w-md mx-auto surface metallic shadow-2xl overflow-hidden rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-md">
                  <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-80" />
                  <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/50 bg-secondary/30">
                    <div className="flex items-center gap-1.5 text-[7px] tracking-[0.2em] text-primary uppercase">
                      <Sparkles className="h-1.5 w-1.5 animate-pulse" />
                      <span>Sponsored</span>
                    </div>
                    <div className="p-1 rounded-md text-muted-foreground">
                      <X className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="relative w-full aspect-video max-h-52 bg-black/40 overflow-hidden flex items-center justify-center">
                    {activeMediaType === "video" ? (
                      <video
                        src={activeMediaUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeMediaUrl}
                        alt="Popup Preview"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-3.5 flex items-center justify-between gap-3 bg-card">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-sm text-foreground truncate">
                        {title || "Special Tournament Announcement"}
                      </h4>
                      {description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {description}
                        </p>
                      )}
                    </div>
                    <span className="btn-gold flex items-center gap-1 px-3 py-1.5 text-xs font-bold shrink-0">
                      <span>Visit</span>
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Target Pages */}
        <div className="border-t border-border pt-6">
          <label className="mb-2 block text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Target Pages <span className="text-primary">*</span>
          </label>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {TARGET_PAGE_OPTIONS.map((page) => {
              const selected = targetPages.includes(page.id);
              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => toggleTargetPage(page.id)}
                  className={`flex items-center justify-between rounded-lg border p-3 text-left transition ${
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-secondary text-muted-foreground hover:bg-secondary/70"
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold">{page.label}</p>
                    <p className="tabular text-[10px] font-mono text-muted-foreground">
                      {page.path}
                    </p>
                  </div>
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground"
                    }`}
                  >
                    {selected && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Schedule & Click-Through URL */}
        <div className="border-t border-border pt-6">
          <h3 className="mb-4 text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Scheduling & Engagement
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="startDate"
                className="mb-1 block text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >
                Start Date (Optional)
              </label>
              <input
                id="startDate"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="endDate"
                className="mb-1 block text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >
                End Date (Optional)
              </label>
              <input
                id="endDate"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-4">
            <label
              htmlFor="clickUrl"
              className="mb-1 block text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Click-Through URL (Optional)
            </label>
            <div className="relative">
              <LinkIcon className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
              <input
                id="clickUrl"
                type="url"
                value={clickUrl}
                onChange={(e) => setClickUrl(e.target.value)}
                placeholder="https://sponsor.com/deal"
                className="w-full rounded-lg border border-border bg-secondary py-2 pr-4 pl-9 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Active Toggle Switch */}
        <div className="flex items-center justify-between border-t border-border pt-6">
          <div>
            <p className="text-xs font-bold text-foreground">Active Status</p>
            <p className="text-[11px] text-muted-foreground">
              Controls whether this ad is served to users across configured target pages.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsActive(!isActive)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isActive ? "bg-primary" : "bg-secondary"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                isActive ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
          <Link href="/admin/ads" className="btn-ghost px-5 py-2.5 text-xs font-bold">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="btn-gold flex items-center gap-2 px-6 py-2.5 text-xs font-extrabold tracking-wider disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {uploadProgress !== null && uploadProgress < 100
                    ? `UPLOADING (${uploadProgress}%)...`
                    : "SAVING CHANGES..."}
                </span>
              </>
            ) : (
              <span>SAVE CHANGES</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
