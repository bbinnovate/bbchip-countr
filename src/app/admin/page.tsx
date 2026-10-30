"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Eye,
  Film,
  Image as ImageIcon,
  Layers,
  Megaphone,
  MousePointerClick,
  Plus,
  RefreshCw,
  TrendingUp,
  Video,
} from "lucide-react";
import type { Ad } from "@/lib/firebase-admin";

interface StatsData {
  total: number;
  active: number;
  inactive: number;
  images: number;
  videos: number;
  totalViews: number;
  totalClicks: number;
  ctr: number;
  byPage: Record<string, number>;
  recent: Ad[];
  topPerforming: Ad[];
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/ads/stats");
      if (!res.ok) {
        throw new Error("Failed to load statistics");
      }
      const data = await res.json();
      setStats(data.stats);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error fetching dashboard stats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const pageLabels: Record<string, { name: string; path: string }> = {
    "/": { name: "Home Screen", path: "/" },
    "/settle/[id]": { name: "Settlement Screen", path: "/settle/[id]" },
    "/history": { name: "History Screen", path: "/history" },
  };

  return (
    <div className="space-y-8">
      {/* Top Banner / Hero */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            ADS <span className="gold-text">DASHBOARD</span>
          </h1>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            Inventory overview, delivery distribution, and recent creative activity.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/80 px-3 py-2 text-xs font-bold text-foreground transition hover:bg-secondary disabled:opacity-50"
            title="Refresh metrics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <Link
            href="/admin/ads/new"
            className="btn-gold flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold tracking-wider"
          >
            <Plus className="h-4 w-4" />
            <span>CREATE AD</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Performance & Analytics KPIs */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
          <span>Performance Overview</span>
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Total Views */}
          <div className="surface metallic p-4 border border-primary/20">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold tracking-widest uppercase">
                Total Views (Impressions)
              </span>
              <Eye className="h-4 w-4 text-primary" />
            </div>
            <div className="tabular mt-2 text-2xl sm:text-3xl font-extrabold text-foreground">
              {loading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-secondary" />
              ) : (
                (stats?.totalViews ?? 0).toLocaleString()
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Drawer impressions delivered</p>
          </div>

          {/* Total Clicks */}
          <div className="surface metallic p-4 border border-primary/20">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold tracking-widest uppercase">Total Clicks</span>
              <MousePointerClick className="h-4 w-4 text-primary" />
            </div>
            <div className="tabular mt-2 text-2xl sm:text-3xl font-extrabold text-foreground">
              {loading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-secondary" />
              ) : (
                (stats?.totalClicks ?? 0).toLocaleString()
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Click-Through URL engagements</p>
          </div>

          {/* Overall CTR */}
          <div className="surface metallic p-4 border border-primary/30 bg-primary/5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold tracking-widest uppercase">Overall CTR</span>
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div className="tabular mt-2 text-2xl sm:text-3xl font-extrabold text-primary">
              {loading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-secondary" />
              ) : (
                `${stats?.ctr ?? 0}%`
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Click-through conversion rate</p>
          </div>
        </div>
      </div>

      {/* Inventory Metrics Grid */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">
          Inventory Breakdown
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {/* Total Ads */}
          <div className="surface p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold tracking-widest uppercase">Total Ads</span>
              <Layers className="h-4 w-4 text-primary" />
            </div>
            <div className="tabular mt-2 text-2xl font-extrabold text-foreground">
              {loading ? (
                <div className="h-7 w-12 animate-pulse rounded bg-secondary" />
              ) : (
                (stats?.total ?? 0)
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Registered creatives</p>
          </div>

          {/* Active Ads */}
          <div className="surface p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold tracking-widest uppercase">Active Ads</span>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
            <div className="tabular mt-2 text-2xl font-extrabold text-success">
              {loading ? (
                <div className="h-7 w-12 animate-pulse rounded bg-secondary" />
              ) : (
                (stats?.active ?? 0)
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Eligible for delivery</p>
          </div>

          {/* Inactive Ads */}
          <div className="surface p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold tracking-widest uppercase">Inactive</span>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="tabular mt-2 text-2xl font-extrabold text-muted-foreground">
              {loading ? (
                <div className="h-7 w-12 animate-pulse rounded bg-secondary" />
              ) : (
                (stats?.inactive ?? 0)
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Paused or draft</p>
          </div>

          {/* Image Ads */}
          <div className="surface p-4">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold tracking-widest uppercase">Image Ads</span>
              <ImageIcon className="h-4 w-4 text-accent-foreground" />
            </div>
            <div className="tabular mt-2 text-2xl font-extrabold text-foreground">
              {loading ? (
                <div className="h-7 w-12 animate-pulse rounded bg-secondary" />
              ) : (
                (stats?.images ?? 0)
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Static & animated</p>
          </div>

          {/* Video Ads */}
          <div className="surface col-span-2 p-4 sm:col-span-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold tracking-widest uppercase">Video Ads</span>
              <Film className="h-4 w-4 text-primary" />
            </div>
            <div className="tabular mt-2 text-2xl font-extrabold text-foreground">
              {loading ? (
                <div className="h-7 w-12 animate-pulse rounded bg-secondary" />
              ) : (
                (stats?.videos ?? 0)
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">MP4 & WebM media</p>
          </div>
        </div>
      </div>

      {/* Top Performing Creatives */}
      {stats && stats.topPerforming && stats.topPerforming.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <span>Top Performing Creatives</span>
            </h2>
            <Link
              href="/admin/ads"
              className="flex items-center gap-1 text-xs font-bold text-primary transition hover:underline"
            >
              <span>View In Manager</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="surface divide-y divide-border/60 overflow-hidden">
            {stats.topPerforming.map((ad, idx) => {
              const adCtr =
                ad.views && ad.views > 0 ? (((ad.clicks ?? 0) / ad.views) * 100).toFixed(1) : "0.0";

              return (
                <div
                  key={ad.id}
                  className="flex flex-col gap-3 p-4 transition hover:bg-secondary/20 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-black text-muted-foreground">
                      #{idx + 1}
                    </span>
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary">
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
                        <Video className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-extrabold text-foreground">{ad.title}</p>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
                            ad.isActive
                              ? "border border-success/40 bg-success/10 text-success"
                              : "border border-border bg-secondary text-muted-foreground"
                          }`}
                        >
                          {ad.isActive ? "Active" : "Inactive"}
                        </span>
                        <span className="rounded border border-border bg-secondary/70 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground uppercase">
                          {ad.mediaType}
                        </span>
                        {/* Ad Type Badge */}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase border ${
                            ad.adType === "banner" ||
                            (!ad.adType && ad.isStatic && ad.staticType === "banner")
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                              : ad.adType === "product" ||
                                  (!ad.adType && ad.isStatic && ad.staticType === "product_card")
                                ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                                : "border-purple-500/40 bg-purple-500/10 text-purple-400"
                          }`}
                        >
                          {ad.adType?.toUpperCase() ||
                            (ad.isStatic
                              ? ad.staticType === "product_card"
                                ? "PRODUCT"
                                : "BANNER"
                              : "POPUP")}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
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
                          <span className="tabular">{adCtr}% CTR</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 border-t border-border/40 pt-2 sm:border-t-0 sm:pt-0">
                    <Link
                      href={`/admin/ads/${ad.id}/edit`}
                      className="btn-ghost px-3 py-1.5 text-[11px] font-bold"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Target Page Breakdown Section */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">
          Target Page Allocation
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Object.entries(pageLabels).map(([pagePath, meta]) => {
            const count = stats?.byPage?.[pagePath] || 0;
            const total = stats?.total || 1;
            const pct = stats?.total ? Math.round((count / total) * 100) : 0;

            return (
              <div key={pagePath} className="surface metallic p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{meta.name}</h3>
                    <p className="tabular text-xs font-mono text-muted-foreground">{pagePath}</p>
                  </div>
                  <span className="tabular rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-extrabold text-primary">
                    {count} ads
                  </span>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-[11px] font-bold text-muted-foreground">
                    <span>Share of inventory</span>
                    <span className="tabular">{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recently Created / Updated Ads */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">
            Recent Ad Activity
          </h2>
          <Link
            href="/admin/ads"
            className="flex items-center gap-1 text-xs font-bold text-primary transition hover:underline"
          >
            <span>Manage All Ads</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {loading ? (
          <div className="surface space-y-3 p-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-secondary" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-secondary" />
                  <div className="h-3 w-1/4 rounded bg-secondary" />
                </div>
              </div>
            ))}
          </div>
        ) : !stats || stats.recent.length === 0 ? (
          /* Empty State */
          <div className="surface flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/50 text-muted-foreground">
              <Megaphone className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-foreground">No Ads in Inventory Yet</h3>
            <p className="mt-1.5 max-w-sm text-xs text-muted-foreground">
              Create your first promotional image or video ad to begin delivering sponsored content
              in the bottom drawer across The Ledger screens.
            </p>
            <Link
              href="/admin/ads/new"
              className="btn-gold mt-5 flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold tracking-wider"
            >
              <Plus className="h-4 w-4" />
              <span>CREATE FIRST AD</span>
            </Link>
          </div>
        ) : (
          /* Recent Ads List */
          <div className="surface divide-y divide-border/60 overflow-hidden">
            {stats.recent.map((ad) => (
              <div
                key={ad.id}
                className="flex flex-col gap-3 p-4 transition hover:bg-secondary/20 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3.5">
                  {/* Thumbnail / Media chip */}
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary">
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
                      <Video className="h-5 w-5 text-primary" />
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-extrabold text-foreground">{ad.title}</p>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
                          ad.isActive
                            ? "border border-success/40 bg-success/10 text-success"
                            : "border border-border bg-secondary text-muted-foreground"
                        }`}
                      >
                        {ad.isActive ? "Active" : "Inactive"}
                      </span>
                      <span className="rounded border border-border bg-secondary/70 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground uppercase">
                        {ad.mediaType}
                      </span>
                      {/* Ad Type Badge */}
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase border ${
                          ad.adType === "banner" ||
                          (!ad.adType && ad.isStatic && ad.staticType === "banner")
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                            : ad.adType === "product" ||
                                (!ad.adType && ad.isStatic && ad.staticType === "product_card")
                              ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                              : "border-purple-500/40 bg-purple-500/10 text-purple-400"
                        }`}
                      >
                        {ad.adType?.toUpperCase() ||
                          (ad.isStatic
                            ? ad.staticType === "product_card"
                              ? "PRODUCT"
                              : "BANNER"
                            : "POPUP")}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Targeting:</span>
                      {ad.targetPages.map((page) => (
                        <span
                          key={page}
                          className="rounded bg-secondary px-1.5 py-0.2 text-[10px] font-mono font-bold text-foreground"
                        >
                          {page}
                        </span>
                      ))}

                      {/* Performance metrics */}
                      <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.2 text-[10px] font-bold text-foreground">
                        <Eye className="h-2.5 w-2.5 text-muted-foreground" />
                        <span>{ad.views ?? 0}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.2 text-[10px] font-bold text-foreground">
                        <MousePointerClick className="h-2.5 w-2.5 text-muted-foreground" />
                        <span>{ad.clicks ?? 0}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.2 text-[10px] font-extrabold text-primary">
                        <span>
                          {ad.views && ad.views > 0
                            ? `${(((ad.clicks ?? 0) / ad.views) * 100).toFixed(1)}%`
                            : "0.0%"}{" "}
                          CTR
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border/40 pt-2 sm:border-t-0 sm:pt-0">
                  <span className="tabular text-[11px] text-muted-foreground">
                    Updated{" "}
                    {new Date(ad.updatedAt).toLocaleDateString("en-IN", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <Link
                    href={`/admin/ads/${ad.id}/edit`}
                    className="btn-ghost ml-4 px-3 py-1.5 text-[11px] font-bold"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
