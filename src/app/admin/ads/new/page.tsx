"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  Film,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { UploadTask } from "firebase/storage";
import { cn } from "@/lib/utils";
import {
  deleteUploadedMedia,
  detectMediaDimensions,
  startMediaUpload,
  validateMediaFile,
  type MediaUploadResult,
} from "@/lib/storage-client";

const TARGET_PAGE_OPTIONS = [
  { id: "/", label: "Home Page", path: "/" },
  { id: "/settle/[id]", label: "Settlement Page", path: "/settle/[id]" },
  { id: "/history", label: "History Page", path: "/history" },
];

export default function CreateAdPage() {
  const router = useRouter();

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetPages, setTargetPages] = useState<string[]>(["/"]);
  const [isActive, setIsActive] = useState(true);
  const [isStatic, setIsStatic] = useState(false);
  const [staticType, setStaticType] = useState<"banner" | "product_card">("banner");
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
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateMediaFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
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
        mediaType: uploadedResult.mediaType,
        mediaUrl: uploadedResult.downloadUrl,
        storagePath: uploadedResult.storagePath,
        mediaWidth: uploadedResult.width,
        mediaHeight: uploadedResult.height,
        aspectRatio: uploadedResult.aspectRatio,
        targetPages,
        isActive,
        isStatic,
        staticType: isStatic ? staticType : null,
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
          <p className="text-xs text-muted-foreground">
            Configure ad creative, targeting, scheduling, and upload media to Firebase Storage.
          </p>
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
        {/* Title & Description */}
        <div className="space-y-4">
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
              placeholder="e.g. Diwali Poker Night Sponsor Banner"
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
              placeholder="Internal notes or promo copy summary..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Media Upload Area */}
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
                Images (JPG, PNG, WEBP, GIF up to 10MB) or Videos (MP4, WEBM up to 50MB)
              </p>
              <p className="mt-2 text-[11px] font-semibold text-primary/80">
                Media will be previewed locally and uploaded only when you submit the form.
              </p>

              {isStatic && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
                  <span>📐 Target Space Fit:</span>
                  <span>
                    {staticType === "banner"
                      ? "3:1 Banner (e.g. 1200×400px) · Image will be cropped to fit"
                      : "1:1 Square (e.g. 600×600px) · Image will be cropped to fit"}
                  </span>
                </div>
              )}

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

          {/* Local Media Preview */}
          {mediaFile && previewUrl && (
            <div className="rounded-xl border border-border bg-secondary/50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="relative flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-black">
                    {mediaType === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl}
                        alt="Local Preview"
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
                          Original Ratio: {aspectRatio}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-foreground truncate max-w-xs">
                      {mediaFile.name}
                    </p>
                    {mediaWidth && mediaHeight && (
                      <p className="tabular text-xs text-muted-foreground">
                        {mediaWidth} × {mediaHeight} px
                      </p>
                    )}
                    <p className="tabular text-[11px] text-muted-foreground">
                      Size: {(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                {!submitting && (
                  <button
                    type="button"
                    onClick={handleRemoveMedia}
                    className="flex items-center gap-1 text-xs font-bold text-destructive hover:underline cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              {/* Live Crop Preview for Static Ads */}
              {isStatic && (
                <div className="mt-4 border-t border-border/60 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-foreground">
                      {staticType === "banner"
                        ? "📐 3:1 Banner Crop Preview"
                        : "📐 1:1 Product Card Crop Preview"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Auto-cropped with object-cover
                    </span>
                  </div>

                  <div
                    className={cn(
                      "relative overflow-hidden rounded-lg border border-primary/30 bg-black",
                      staticType === "banner"
                        ? "w-full max-w-md aspect-[3/1]"
                        : "w-32 aspect-square",
                    )}
                  >
                    {mediaType === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl}
                        alt="Crop Preview"
                        className="h-full w-full object-cover object-center"
                      />
                    ) : (
                      <video
                        src={previewUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="h-full w-full object-cover object-center"
                      />
                    )}
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    {staticType === "banner"
                      ? "Recommended upload size: 1200×400px (3:1 ratio). Other sizes are automatically centered and cropped to fit."
                      : "Recommended upload size: 600×600px (1:1 ratio). Other sizes are automatically centered and cropped to fit."}
                  </p>
                </div>
              )}

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

        {/* Target Pages */}
        <div className="border-t border-border pt-6">
          <label className="mb-2 block text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Target Pages <span className="text-primary">*</span>
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            Select one or more screens where this ad will appear in the bottom drawer.
          </p>

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
                placeholder="https://sponsor.com/deal"
                value={clickUrl}
                onChange={(e) => setClickUrl(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary py-2 pr-4 pl-9 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Static Ad Radio Option */}
        <div className="border-t border-border pt-6">
          <label className="mb-1 block text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Static Ad?
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            Specify whether this creative is a static advertisement.
          </p>

          <div className="grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                isStatic
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-secondary text-muted-foreground hover:bg-secondary/70"
              }`}
            >
              <input
                type="radio"
                name="isStatic"
                checked={isStatic === true}
                onChange={() => setIsStatic(true)}
                className="h-4 w-4 accent-primary"
              />
              <div>
                <p className="text-xs font-bold text-foreground">True</p>
                <p className="text-[10px] text-muted-foreground">Static creative</p>
              </div>
            </label>

            <label
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                !isStatic
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-secondary text-muted-foreground hover:bg-secondary/70"
              }`}
            >
              <input
                type="radio"
                name="isStatic"
                checked={isStatic === false}
                onChange={() => setIsStatic(false)}
                className="h-4 w-4 accent-primary"
              />
              <div>
                <p className="text-xs font-bold text-foreground">False</p>
                <p className="text-[10px] text-muted-foreground">Regular / rotating ad</p>
              </div>
            </label>
          </div>

          {/* Conditional Static Ad Type Options (shown only if isStatic is true) */}
          {isStatic && (
            <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="mb-1 block text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Static Ad Type <span className="text-primary">*</span>
              </label>
              <p className="mb-3 text-xs text-muted-foreground">
                Select whether this static ad is formatted as a Banner or Product Cards.
              </p>

              <div className="grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                    staticType === "banner"
                      ? "border-primary bg-primary/20 text-foreground shadow-sm"
                      : "border-border bg-secondary text-muted-foreground hover:bg-secondary/70"
                  }`}
                >
                  <input
                    type="radio"
                    name="staticType"
                    value="banner"
                    checked={staticType === "banner"}
                    onChange={() => setStaticType("banner")}
                    className="h-4 w-4 accent-primary"
                  />
                  <div>
                    <p className="text-xs font-bold text-foreground">Banner</p>
                    <p className="text-[10px] text-muted-foreground">
                      3:1 Ratio (e.g. 1200×400px) · Cropped
                    </p>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                    staticType === "product_card"
                      ? "border-primary bg-primary/20 text-foreground shadow-sm"
                      : "border-border bg-secondary text-muted-foreground hover:bg-secondary/70"
                  }`}
                >
                  <input
                    type="radio"
                    name="staticType"
                    value="product_card"
                    checked={staticType === "product_card"}
                    onChange={() => setStaticType("product_card")}
                    className="h-4 w-4 accent-primary"
                  />
                  <div>
                    <p className="text-xs font-bold text-foreground">Product Cards</p>
                    <p className="text-[10px] text-muted-foreground">
                      1:1 Square (e.g. 600×600px) · Cropped
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}
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
            className="btn-gold flex items-center gap-2 px-6 py-2.5 text-xs font-extrabold tracking-wider disabled:opacity-50"
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
