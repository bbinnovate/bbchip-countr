"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicAd } from "@/lib/firebase-admin";

type Props = {
  /** Which screen the slot sits on: "home" | "history" | "settle" */
  placement: "home" | "history" | "settle";
  /** banner | product | auto (default: "auto" - automatically displays according to the ads targeted for this page) */
  type?: "banner" | "product" | "auto";
  /** Product slots only: number of cards in the row (default: 4) */
  count?: number;
  className?: string;
};

const PLACEMENT_PAGES: Record<Props["placement"], string> = {
  home: "/",
  history: "/history",
  settle: "/settle/[id]",
};

export function AdSlot({ placement, type = "auto", count = 4, className }: Props) {
  const [ads, setAds] = useState<PublicAd[]>([]);
  const [loaded, setLoaded] = useState(false);
  const trackedViewsRef = useRef<Set<string>>(new Set());

  const targetPage = PLACEMENT_PAGES[placement] || "/";

  useEffect(() => {
    let isMounted = true;

    async function loadStaticAds() {
      try {
        const queryCount = Math.max(count, 6);
        const res = await fetch(
          `/api/ads/serve?page=${encodeURIComponent(targetPage)}&isStatic=true&count=${queryCount}`,
          { cache: "no-store" },
        );

        if (!res.ok) {
          if (isMounted) setLoaded(true);
          return;
        }

        const data = await res.json();
        const fetched: PublicAd[] =
          Array.isArray(data.ads) && data.ads.length > 0 ? data.ads : data.ad ? [data.ad] : [];

        // Strictly keep only static ads
        const validStatic = fetched.filter((ad) => ad.isStatic);

        if (isMounted) {
          setAds(validStatic);
          setLoaded(true);
        }
      } catch (err) {
        console.error("AdSlot fetch error:", err);
        if (isMounted) setLoaded(true);
      }
    }

    void loadStaticAds();

    return () => {
      isMounted = false;
    };
  }, [targetPage, count]);

  // View (Impression) tracking for rendered static ads
  useEffect(() => {
    if (ads.length > 0) {
      for (const ad of ads) {
        if (!trackedViewsRef.current.has(ad.id)) {
          trackedViewsRef.current.add(ad.id);
          try {
            void fetch("/api/ads/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ adId: ad.id, event: "view" }),
              keepalive: true,
            });
          } catch {
            // Ignore tracking errors
          }
        }
      }
    }
  }, [ads]);

  // Click tracking
  const handleAdClick = (adId: string) => {
    try {
      const payload = JSON.stringify({ adId, event: "click" });
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/ads/track", blob);
      } else {
        void fetch("/api/ads/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      }
    } catch {
      // Ignore tracking errors
    }
  };

  // Only render when ads exist; if there are no static ads, render nothing
  if (!loaded || ads.length === 0) {
    return null;
  }

  const bannerAds = ads.filter((ad) => !ad.staticType || ad.staticType === "banner");
  const productAds = ads.filter((ad) => ad.staticType === "product_card");

  let displayBanners = bannerAds;
  let displayProducts = productAds;

  if (type === "banner" && bannerAds.length > 0) {
    displayProducts = [];
  } else if (type === "product" && productAds.length > 0) {
    displayBanners = [];
  }

  if (displayBanners.length === 0 && displayProducts.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="Advertisement space"
      data-ad-placement={placement}
      data-ad-type={type}
      className={cn("mb-6 space-y-3", className)}
    >
      {displayBanners.map((ad) => (
        <StaticBannerCard key={ad.id} ad={ad} onAdClick={handleAdClick} />
      ))}
      {displayProducts.length > 0 && (
        <div
          className={cn(
            "grid gap-3",
            displayProducts.length === 1 ? "max-w-xs mx-auto w-full" : "grid-cols-2",
          )}
        >
          {displayProducts.slice(0, count).map((ad) => (
            <StaticProductCard key={ad.id} ad={ad} onAdClick={handleAdClick} />
          ))}
        </div>
      )}
    </aside>
  );
}

function StaticBannerCard({ ad, onAdClick }: { ad: PublicAd; onAdClick: (id: string) => void }) {
  // Static banner ad space: 3:1 aspect ratio (or 16:9 if specified), with media cropped to fit
  const aspectClass = ad.aspectRatio === "16:9" ? "aspect-video" : "aspect-[3/1]";

  const content = (
    <div className="group relative w-full overflow-hidden rounded-xl border border-primary/20 bg-card shadow-md transition hover:border-primary/40">
      {/* Top subtle sponsored tag */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-primary backdrop-blur-sm">
        <Sparkles className="h-2.5 w-2.5 animate-pulse" />
        <span>Sponsored</span>
      </div>

      {/* Media container: 3:1 cropped container */}
      <div
        className={cn(
          "relative w-full overflow-hidden bg-black/30 flex items-center justify-center",
          aspectClass,
        )}
      >
        {ad.mediaType === "video" ? (
          <video
            src={ad.mediaUrl}
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover object-center"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.mediaUrl}
            alt={ad.title}
            loading="lazy"
            className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.01]"
          />
        )}
      </div>

      {/* Banner Footer / Info */}
      <div className="flex items-center justify-between gap-3 bg-secondary/40 p-2.5 sm:px-3.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-foreground">{ad.title}</p>
          {ad.description && (
            <p className="truncate text-[10px] text-muted-foreground">{ad.description}</p>
          )}
        </div>

        {ad.clickUrl && (
          <span className="btn-gold flex shrink-0 items-center gap-1 px-2.5 py-1 text-[10px] font-extrabold tracking-wider">
            <span>Learn More</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </span>
        )}
      </div>
    </div>
  );

  if (ad.clickUrl) {
    return (
      <a
        href={ad.clickUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onAdClick(ad.id)}
        className="block cursor-pointer"
      >
        {content}
      </a>
    );
  }

  return content;
}

function StaticProductCard({ ad, onAdClick }: { ad: PublicAd; onAdClick: (id: string) => void }) {
  const cardContent = (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-primary/20 bg-card shadow-md transition hover:border-primary/40">
      {/* Top Sponsored tag */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-primary backdrop-blur-sm">
        <Sparkles className="h-2.5 w-2.5 animate-pulse" />
        <span>Featured</span>
      </div>

      {/* Media thumbnail */}
      <div className="relative aspect-square w-full overflow-hidden bg-black/30">
        {ad.mediaType === "video" ? (
          <video
            src={ad.mediaUrl}
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover object-center"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.mediaUrl}
            alt={ad.title}
            loading="lazy"
            className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.03]"
          />
        )}
      </div>

      {/* Product Details */}
      <div className="flex flex-1 flex-col justify-between p-2.5">
        <div>
          <h4 className="line-clamp-1 text-xs font-bold text-foreground">{ad.title}</h4>
          {ad.description && (
            <p className="line-clamp-2 mt-0.5 text-[10px] text-muted-foreground">
              {ad.description}
            </p>
          )}
        </div>

        {ad.clickUrl && (
          <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-[10px] font-bold text-primary">
            <span>View Deal</span>
            <ExternalLink className="h-3 w-3" />
          </div>
        )}
      </div>
    </div>
  );

  if (ad.clickUrl) {
    return (
      <a
        href={ad.clickUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onAdClick(ad.id)}
        className="block h-full cursor-pointer"
      >
        {cardContent}
      </a>
    );
  }

  return cardContent;
}
