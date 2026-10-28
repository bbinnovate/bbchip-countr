"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Film,
  Image as ImageIcon,
  Loader2,
  MoreVertical,
  MousePointerClick,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Ad } from "@/lib/firebase-admin";

export default function AdminAdsListPage() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [mediaType, setMediaType] = useState("all");
  const [targetPage, setTargetPage] = useState("all");

  // Deletion modal state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchAds = async (targetPageNum = page) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("status", status);
      if (mediaType !== "all") params.set("mediaType", mediaType);
      if (targetPage !== "all") params.set("targetPage", targetPage);
      params.set("page", targetPageNum.toString());
      params.set("limit", "10");

      const res = await fetch(`/api/admin/ads?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load ads");
      const data = await res.json();

      setAds(data.ads || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load ads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAds(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mediaType, targetPage]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAds(1);
  };

  const handleToggleActive = async (ad: Ad) => {
    setTogglingId(ad.id);
    try {
      // Get CSRF token from cookie if available
      const match = document.cookie.match(/(?:^|; )ledger_csrf_token=([^;]*)/);
      const csrfToken = match && match[1] ? decodeURIComponent(match[1]) : "";

      const res = await fetch(`/api/admin/ads/${ad.id}/toggle`, {
        method: "PATCH",
        headers: {
          "x-csrf-token": csrfToken,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update ad status");
      }

      const data = await res.json();
      setAds((prev) =>
        prev.map((item) => (item.id === ad.id ? { ...item, isActive: data.isActive } : item)),
      );
      toast.success(data.message || `Ad ${data.isActive ? "activated" : "deactivated"}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);

    try {
      const match = document.cookie.match(/(?:^|; )ledger_csrf_token=([^;]*)/);
      const csrfToken = match && match[1] ? decodeURIComponent(match[1]) : "";

      const res = await fetch(`/api/admin/ads/${deletingId}`, {
        method: "DELETE",
        headers: {
          "x-csrf-token": csrfToken,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to delete ad");
      }

      toast.success("Ad and associated media deleted successfully");
      setDeletingId(null);
      fetchAds(page);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            ADS <span className="gold-text">MANAGER</span>
          </h1>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            Create, update, activate/deactivate, and schedule promotional creatives.
          </p>
        </div>

        <Link
          href="/admin/ads/new"
          className="btn-gold flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-extrabold tracking-wider"
        >
          <Plus className="h-4 w-4" />
          <span>NEW AD</span>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="surface p-4">
        <form
          onSubmit={handleSearchSubmit}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          {/* Search box */}
          <div className="relative lg:col-span-2">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by title or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary py-2 pr-4 pl-9 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Status filter */}
          <div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          {/* Media Type filter */}
          <div>
            <select
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Media Types</option>
              <option value="image">Images Only</option>
              <option value="video">Videos Only</option>
            </select>
          </div>

          {/* Target Page filter */}
          <div>
            <select
              value={targetPage}
              onChange={(e) => setTargetPage(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Target Pages</option>
              <option value="/">Home (/)</option>
              <option value="/settle/[id]">Settlement (/settle/[id])</option>
              <option value="/history">History (/history)</option>
            </select>
          </div>
        </form>
      </div>

      {/* Ads Table / List */}
      <div className="surface overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-4">
                <div className="h-14 w-14 rounded-lg bg-secondary" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/4 rounded bg-secondary" />
                  <div className="h-3 w-1/3 rounded bg-secondary" />
                </div>
              </div>
            ))}
          </div>
        ) : ads.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-border bg-secondary/50 text-muted-foreground">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-foreground">No Ads Found</h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              No advertisements match your current search and filter criteria.
            </p>
            <button
              onClick={() => {
                setSearch("");
                setStatus("all");
                setMediaType("all");
                setTargetPage("all");
                fetchAds(1);
              }}
              className="btn-ghost mt-4 px-3 py-1.5 text-xs font-bold"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {ads.map((ad) => {
              const isToggling = togglingId === ad.id;

              return (
                <div
                  key={ad.id}
                  className="flex flex-col gap-4 p-4 transition hover:bg-secondary/10 sm:flex-row sm:items-center sm:justify-between"
                >
                  {/* Left: Creative Media Preview & Details */}
                  <div className="flex items-start gap-4 sm:items-center">
                    {/* Media Thumbnail */}
                    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary">
                      {ad.mediaType === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ad.mediaUrl}
                          alt={ad.title}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-primary">
                          <Film className="h-6 w-6" />
                          <span className="text-[9px] font-bold">VIDEO</span>
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-extrabold text-foreground">{ad.title}</h3>
                        <span className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[9px] font-extrabold text-muted-foreground uppercase">
                          {ad.mediaType}
                        </span>
                        {ad.aspectRatio && (
                          <span className="tabular rounded border border-border bg-secondary/80 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                            {ad.aspectRatio}
                          </span>
                        )}
                        {ad.isStatic && (
                          <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-extrabold text-primary uppercase">
                            Static{ad.staticType === "product_card" ? " · Cards" : " · Banner"}
                          </span>
                        )}
                      </div>

                      {ad.description && (
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {ad.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
                        <span className="font-semibold text-muted-foreground/80">Targeting:</span>
                        {ad.targetPages.map((page) => (
                          <span
                            key={page}
                            className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold text-foreground"
                          >
                            {page}
                          </span>
                        ))}

                        {ad.clickUrl && (
                          <a
                            href={ad.clickUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 inline-flex items-center gap-1 text-[10px] text-primary transition hover:underline"
                          >
                            <span>Link</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>

                      {/* Performance Metrics: Views, Clicks, and CTR */}
                      <div className="flex flex-wrap items-center gap-2 pt-1.5">
                        <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[10px] font-bold text-foreground">
                          <Eye className="h-3 w-3 text-muted-foreground" />
                          <span className="tabular">{(ad.views ?? 0).toLocaleString()} views</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[10px] font-bold text-foreground">
                          <MousePointerClick className="h-3 w-3 text-muted-foreground" />
                          <span className="tabular">
                            {(ad.clicks ?? 0).toLocaleString()} clicks
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                          <span className="tabular">
                            {ad.views && ad.views > 0
                              ? `${(((ad.clicks ?? 0) / ad.views) * 100).toFixed(1)}%`
                              : "0.0%"}{" "}
                            CTR
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Status Toggle & Actions */}
                  <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-3 sm:border-t-0 sm:pt-0">
                    {/* Active/Inactive Switch button */}
                    <button
                      onClick={() => handleToggleActive(ad)}
                      disabled={isToggling}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                        ad.isActive
                          ? "border-success/40 bg-success/10 text-success hover:bg-success/20"
                          : "border-border bg-secondary text-muted-foreground hover:bg-secondary/70"
                      }`}
                      title={ad.isActive ? "Click to deactivate" : "Click to activate"}
                    >
                      {isToggling ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <span
                          className={`h-2 w-2 rounded-full ${
                            ad.isActive ? "bg-success" : "bg-muted-foreground"
                          }`}
                        />
                      )}
                      <span>{ad.isActive ? "Active" : "Inactive"}</span>
                    </button>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/admin/ads/${ad.id}/edit`}
                        className="btn-ghost flex h-8 w-8 items-center justify-center rounded-lg p-0 text-muted-foreground transition hover:text-foreground"
                        title="Edit Ad"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>

                      <button
                        onClick={() => setDeletingId(ad.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive transition hover:bg-destructive/20"
                        title="Delete Ad"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {total > 0 && (
          <div className="flex items-center justify-between border-t border-border/60 bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
            <div>
              <span>
                Showing <strong className="text-foreground">{ads.length}</strong> of{" "}
                <strong className="text-foreground">{total}</strong> creatives
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => fetchAds(page - 1)}
                className="btn-ghost flex h-8 w-8 items-center justify-center rounded-lg p-0 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="tabular font-bold text-foreground">
                Page {page} of {totalPages}
              </span>

              <button
                disabled={page >= totalPages || loading}
                onClick={() => fetchAds(page + 1)}
                className="btn-ghost flex h-8 w-8 items-center justify-center rounded-lg p-0 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="surface metallic w-full max-w-md p-6">
            <div className="flex items-center gap-3 text-destructive">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-destructive/40 bg-destructive/10">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-foreground">Delete Advertisement</h3>
                <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Are you sure you want to permanently delete this ad? It will be removed from Firestore
              and its associated media will be cleaned up from Firebase Storage.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setDeletingId(null)}
                disabled={isDeleting}
                className="btn-ghost px-4 py-2 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 rounded-lg border border-destructive bg-destructive px-4 py-2 text-xs font-extrabold text-white transition hover:bg-destructive/90 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Ad</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
