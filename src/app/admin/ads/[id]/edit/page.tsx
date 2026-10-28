"use client";

import { useEffect, useState, use } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import type { UploadTask } from "firebase/storage";
import {
  deleteUploadedMedia,
  startMediaUpload,
  validateMediaFile,
  type MediaUploadResult,
} from "@/lib/storage-client";
import type { Ad } from "@/lib/firebase-admin";

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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetPages, setTargetPages] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [clickUrl, setClickUrl] = useState("");

  // Media State
  const [currentMediaUrl, setCurrentMediaUrl] = useState("");
  const [currentStoragePath, setCurrentStoragePath] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [mediaWidth, setMediaWidth] = useState<number | undefined>();
  const [mediaHeight, setMediaHeight] = useState<number | undefined>();
  const [aspectRatio, setAspectRatio] = useState<string | undefined>();

  // Replacement Media Upload State
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadTask, setUploadTask] = useState<UploadTask | null>(null);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateMediaFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setMediaFile(file);
    setError(null);
    setUploadProgress(0);

    const { task, promise } = startMediaUpload(file, (pct) => {
      setUploadProgress(pct);
    });
    setUploadTask(task);

    try {
      const result: MediaUploadResult = await promise;
      setCurrentMediaUrl(result.downloadUrl);
      setCurrentStoragePath(result.storagePath);
      setMediaType(result.mediaType);
      setMediaWidth(result.width);
      setMediaHeight(result.height);
      setAspectRatio(result.aspectRatio);
      toast.success("New creative uploaded to Firebase Storage");
    } catch (err: unknown) {
      const isCanceled =
        typeof err === "object" && err !== null && "code" in err && err.code === "storage/canceled";
      if (isCanceled) {
        toast.info("Upload canceled");
      } else {
        toast.error("Failed to upload replacement media");
      }
      setMediaFile(null);
    } finally {
      setUploadProgress(null);
      setUploadTask(null);
    }
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

    try {
      const match = document.cookie.match(/(?:^|; )ledger_csrf_token=([^;]*)/);
      const csrfToken = match && match[1] ? decodeURIComponent(match[1]) : "";

      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        mediaType,
        mediaUrl: currentMediaUrl,
        storagePath: currentStoragePath,
        mediaWidth,
        mediaHeight,
        aspectRatio,
        targetPages,
        isActive,
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

      toast.success("Ad updated successfully in Firestore!");
      router.push("/admin/ads");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error updating ad");
      setSubmitting(false);
    }
  };

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

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Edit Form */}
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

          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-black">
                  {mediaType === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentMediaUrl}
                      alt="Preview"
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
                  className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs font-bold"
                >
                  <UploadCloud className="h-4 w-4" />
                  <span>Replace Media</span>
                </button>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                  onChange={handleFileSelect}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Replace creative media"
                />
              </div>
            </div>

            {uploadProgress !== null && (
              <div className="mt-4 border-t border-border/70 pt-3">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-2 text-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    Uploading replacement media...
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
              Controls whether this ad is delivered in the bottom drawer.
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
                <span>SAVING CHANGES...</span>
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
