"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Sparkles,
  Trash2,
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
import type { AdType } from "@/lib/firebase-admin";

const TARGET_PAGE_OPTIONS = [
  { id: "/", label: "Home Page", path: "/" },
  { id: "/settle/[id]", label: "Settlement Page", path: "/settle/[id]" },
  { id: "/history", label: "History Page", path: "/history" },
];

export default function CreateAdPage() {
  const router = useRouter();

  // Form State
  const [adType, setAdType] = useState<AdType>("banner");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetPages, setTargetPages] = useState<string[]>(["/"]);
  const [isActive, setIsActive] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [clickUrl, setClickUrl] = useState("");

  // Media Selection State (local preview before submit)
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [mediaWidth, setMediaWidth] = useState<number | undefined>();
  const [mediaHeight, setMediaHeight] = useState<number | undefined>();
  const [aspectRatio, setAspectRatio] = useState<string | undefined>();
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadTask, setUploadTask] = useState<UploadTask | null>(null);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cleanup object URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

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

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const localUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    setMediaFile(file);
    setPreviewUrl(localUrl);
    setMediaType(isVideo ? "video" : "image");
    setFileSizeBytes(file.size);
    setError(null);

    try {
      const dimensions = await detectMediaDimensions(file);
      setMediaWidth(dimensions.width);
      setMediaHeight(dimensions.height);
      setAspectRatio(dimensions.aspectRatio);
    } catch (err) {
      console.warn("Failed to detect media dimensions:", err);
    }
  };

  const handleCancelUpload = () => {
    if (uploadTask) {
      uploadTask.cancel();
    }
    setUploadProgress(null);
    setSubmitting(false);
  };

  const handleRemoveMedia = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setMediaFile(null);
    setPreviewUrl(null);
    setMediaWidth(undefined);
    setMediaHeight(undefined);
    setAspectRatio(undefined);
    setFileSizeBytes(0);
  };

  const toggleTargetPage = (pageId: string) => {
    setTargetPages((prev) =>
      prev.includes(pageId) ? prev.filter((p) => p !== pageId) : [...prev, pageId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!title.trim()) {
      setError("Ad title is required");
      return;
    }

    if (!mediaFile) {
      setError("Please select an image or video creative");
      return;
    }

    if (targetPages.length === 0) {
      setError("Please select at least one target page");
      return;
    }

    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      setError("End date must be scheduled after start date");
      return;
    }

    setSubmitting(true);
    setUploadProgress(0);

    let uploadedResult: MediaUploadResult | null = null;

    try {
      // 1. Upload to Firebase Storage upon submit
      const { task, promise } = startMediaUpload(mediaFile, (pct) => {
        setUploadProgress(pct);
      });
      setUploadTask(task);

      uploadedResult = await promise;

      // 2. Save Ad Document to Firestore
      const match = document.cookie.match(/(?:^|; )ledger_csrf_token=([^;]*)/);
      const csrfToken = match && match[1] ? decodeURIComponent(match[1]) : "";

      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        adType,
        mediaType: uploadedResult.mediaType,
        mediaUrl: uploadedResult.downloadUrl,
        storagePath: uploadedResult.storagePath,
        mediaWidth: uploadedResult.width,
        mediaHeight: uploadedResult.height,
        aspectRatio: uploadedResult.aspectRatio,
        targetPages,
        isActive,
        isStatic: adType !== "popup",
        staticType: adType === "product" ? "product_card" : adType === "banner" ? "banner" : null,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
        clickUrl: clickUrl.trim() || null,
      };

      const res = await fetch("/api/admin/ads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create ad");
      }

      toast.success("Ad created successfully in Firestore!");
      router.push("/admin/ads");
    } catch (err: unknown) {
      // If media upload succeeded but saving to Firestore failed, clean up uploaded storage file
      if (uploadedResult?.storagePath) {
        await deleteUploadedMedia(uploadedResult.storagePath);
      }

      const isCanceled =
        typeof err === "object" && err !== null && "code" in err && err.code === "storage/canceled";
      if (isCanceled) {
        toast.info("Upload canceled");
      } else {
        const msg = err instanceof Error ? err.message : "Error creating ad";
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
      setUploadTask(null);
    }
  };

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
            CREATE <span className="gold-text">NEW AD</span>
          </h1>
          {/* <p className="text-xs text-muted-foreground">
            Configure ad format, copy, preview, targeting, and upload media to Firebase Storage.
          </p> */}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="surface metallic space-y-6 p-6 sm:p-8">
        {/* 1. Ads Type Radio Selection */}
        <div>
          <label className="mb-1 block text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Ads Type <span className="text-primary">*</span>
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            Select the ad placement format. Banner & Product ads appear in page; Popup ads appear in
            the bottom drawer.
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
                <strong className="text-foreground">Site</strong>. Ideal for 1200×400px creatives.
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
                Square featured deal card in <strong className="text-foreground">Site</strong>.
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
                Slide-up floating drawer in <strong className="text-foreground">Site</strong> with
                backdrop and dismiss control.
              </p>
            </label>
          </div>
        </div>

        {/* 2. Title & Description */}
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
              placeholder={
                adType === "banner"
                  ? "e.g. Diwali Mega Poker Festival"
                  : adType === "product"
                    ? "e.g. Clay Poker Chips Set - 500 Pcs"
                    : "e.g. Special Weekend Bonus Chips"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
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
              placeholder="Enter promo copy or internal notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* 3. Creative Media & Live Realistic Preview */}
        <div className="border-t border-border pt-6">
          <label className="mb-2 block text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Creative Media (Image or Video) <span className="text-primary">*</span>
          </label>

          {!mediaFile && (
            <div className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-secondary/30 p-8 text-center transition hover:border-primary/50">
              <UploadCloud className="h-10 w-10 text-primary" />
              <p className="mt-2 text-sm font-bold text-foreground">
                Drop your creative media here or browse
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Images (JPG, PNG, WEBP · auto-compressed to ≤ 1MB) or Videos (MP4, WEBM up to 7MB)
              </p>

              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
                <span>📐 Selected Format Target:</span>
                <span>
                  {adType === "banner" && "3:1 Banner (e.g. 1200×400px)"}
                  {adType === "product" && "1:1 Square (e.g. 600×600px)"}
                  {adType === "popup" && "Mobile Drawer Card (16:9 / Video)"}
                </span>
              </div>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                onChange={handleFileSelect}
                disabled={submitting}
                className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                aria-label="Select advertisement media"
              />
            </div>
          )}

          {/* Media Info & Realistic Preview */}
          {mediaFile && previewUrl && (
            <div className="space-y-4 rounded-xl border border-border bg-secondary/50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="relative flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-black">
                    {mediaType === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl}
                        alt="Uploaded creative"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <video
                        src={previewUrl}
                        className="h-full w-full object-contain"
                        controls
                        muted
                      />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary uppercase">
                        {mediaType}
                      </span>
                      <span className="rounded border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Ready to upload on save
                      </span>
                      {aspectRatio && (
                        <span className="tabular text-xs font-bold text-muted-foreground">
                          Ratio: {aspectRatio}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-foreground truncate max-w-xs">
                      {mediaFile.name}
                    </p>
                    {mediaWidth && mediaHeight && (
                      <p className="tabular text-xs text-muted-foreground">
                        {mediaWidth} × {mediaHeight} px ·{" "}
                        {(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    )}
                  </div>
                </div>

                {!submitting && (
                  <button
                    type="button"
                    onClick={handleRemoveMedia}
                    className="flex items-center gap-1 text-xs font-bold text-destructive hover:underline cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Change</span>
                  </button>
                )}
              </div>

              {/* REALISTIC LIVE PREVIEW ACCORDING TO SELECTED AD TYPE */}
              <div className="border-t border-border/60 pt-4">
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
                      {mediaType === "video" ? (
                        <video
                          src={previewUrl}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="h-full w-full object-cover object-center"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrl}
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
                          <p className="truncate text-[10px] text-muted-foreground">
                            {description}
                          </p>
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
                      {mediaType === "video" ? (
                        <video
                          src={previewUrl}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="h-full w-full object-cover object-center"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrl}
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
                      {mediaType === "video" ? (
                        <video
                          src={previewUrl}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrl}
                          alt="Popup Preview"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="p-3.5 flex items-center justify-between gap-3 bg-card">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-foreground truncate">
                          {title || "Popup Ad Title"}
                        </h4>
                        {description && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {description}
                          </p>
                        )}
                      </div>
                      <span className="btn-gold shrink-0 px-3 py-1.5 text-[11px] flex items-center gap-1.5">
                        <span>Learn More</span>
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Uploading progress bar during submit */}
              {submitting && uploadProgress !== null && (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-2 text-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Uploading creative to Firebase Storage...
                    </span>
                    <span className="tabular text-primary">{uploadProgress}%</span>
                  </div>

                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-yellow-500 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. Target Pages */}
        <div className="border-t border-border pt-6">
          <label className="mb-2 block text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Target Pages <span className="text-primary">*</span>
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            Select one or more screens where this ad will be served.
          </p>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {TARGET_PAGE_OPTIONS.map((page) => {
              const selected = targetPages.includes(page.id);
              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => toggleTargetPage(page.id)}
                  className={`flex items-center justify-between rounded-lg border p-3 text-left transition cursor-pointer ${
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

        {/* 5. Scheduling & Engagement */}
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
                placeholder="https://sponsor.com/deal"
                value={clickUrl}
                onChange={(e) => setClickUrl(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary py-2 pr-4 pl-9 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Active Toggle Switch */}
        <div className="flex items-center justify-between border-t border-border pt-6">
          <div>
            <p className="text-xs font-bold text-foreground">Activate Immediately</p>
            <p className="text-[11px] text-muted-foreground">
              If active, this ad becomes eligible for delivery on the selected target screens.
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

        {/* Form Action Buttons */}
        <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
          <Link href="/admin/ads" className="btn-ghost px-5 py-2.5 text-xs font-bold">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="btn-gold flex items-center gap-2 px-6 py-2.5 text-xs font-extrabold tracking-wider disabled:opacity-50 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {uploadProgress !== null && uploadProgress < 100
                    ? `UPLOADING (${uploadProgress}%)...`
                    : "SAVING..."}
                </span>
              </>
            ) : (
              <span>CREATE ADVERTISEMENT</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
