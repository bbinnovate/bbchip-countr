"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ChevronLeft, ChevronRight, ExternalLink, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdType, PublicAd, StaticAdType } from "@/lib/firebase-admin";
import { isMediaKnownBroken, markMediaUrlFailed, verifyMediaAccessible } from "@/lib/media-verify";

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

// Module-level in-memory cache to keep ads instantaneous on page navigation (like RECENT GAMES)
const inMemoryAds = new Map<string, PublicAd[]>();
const trackedViewsGlobal = new Set<string>();

// One-time cleanup for any stale sessionStorage cache from previous builds
if (typeof window !== "undefined") {
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith("ad_slot_cache_")) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage errors
  }
}

export function AdSlot({ placement, type = "auto", count = 4, className }: Props) {
  const targetPage = PLACEMENT_PAGES[placement] || "/";

  // Initial state reads synchronously from memory cache if already visited in this session
  const [ads, setAds] = useState<PublicAd[]>(() => inMemoryAds.get(targetPage) ?? []);
  const [loaded, setLoaded] = useState<boolean>(() => inMemoryAds.has(targetPage));
  const [failedAdIds, setFailedAdIds] = useState<Set<string>>(new Set());

  const handleMediaError = useCallback((id: string, mediaUrl: string) => {
    markMediaUrlFailed(mediaUrl);
    setFailedAdIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Real-time Firestore subscription: updates LIVE whenever admin adds/changes ads
    // (exact same real-time behavior as RECENT GAMES)
    const unsub = onSnapshot(
      collection(db, "ads"),
      async (snapshot) => {
        const now = Date.now();
        const candidateAds: (PublicAd & { createdAt?: string })[] = [];

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          const isActive = data.isActive === true;
          const targetPages: string[] = Array.isArray(data.targetPages) ? data.targetPages : [];

          if (!isActive) continue;
          if (!targetPages.includes(targetPage)) continue;

          // Check adType: banner and product belong in AdSlot. Popup belongs in AdDrawer.
          const rawType = data.adType as AdType | undefined;
          const isStaticLegacy = data.isStatic === true;
          const isEligible =
            rawType === "banner" || rawType === "product" || (!rawType && isStaticLegacy);

          if (!isEligible) continue;

          // 1. Strict check: mediaUrl must not be empty or whitespace (if cleared in database, skip)
          const rawMediaUrl = typeof data.mediaUrl === "string" ? data.mediaUrl.trim() : "";
          if (!rawMediaUrl) continue;
          if (isMediaKnownBroken(rawMediaUrl)) continue;

          // Date scheduling checks
          if (data.startDate) {
            const start = new Date(data.startDate).getTime();
            if (!isNaN(start) && now < start) continue;
          }
          if (data.endDate) {
            const end = new Date(data.endDate).getTime();
            if (!isNaN(end) && now > end) continue;
          }

          const resolvedType: AdType =
            rawType === "banner" || rawType === "product"
              ? rawType
              : data.staticType === "product_card"
                ? "product"
                : "banner";

          candidateAds.push({
            id: docSnap.id,
            title: String(data.title || ""),
            description: data.description ? String(data.description) : undefined,
            mediaType: data.mediaType === "video" ? "video" : "image",
            mediaUrl: rawMediaUrl,
            mediaWidth: typeof data.mediaWidth === "number" ? data.mediaWidth : undefined,
            mediaHeight: typeof data.mediaHeight === "number" ? data.mediaHeight : undefined,
            aspectRatio: data.aspectRatio ? String(data.aspectRatio) : undefined,
            clickUrl: data.clickUrl ? String(data.clickUrl) : null,
            adType: resolvedType,
            isStatic: true,
            staticType: resolvedType === "product" ? "product_card" : "banner",
            createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
          });
        }

        // Sort latest first
        candidateAds.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        });

        // 2. Strict media verification: verify media file exists in storage and is accessible
        const checkResults = await Promise.all(
          candidateAds.map(async (ad) => {
            const ok = await verifyMediaAccessible(ad.mediaUrl, ad.mediaType);
            return ok ? ad : null;
          }),
        );
        const verifiedAds = checkResults.filter((ad): ad is NonNullable<typeof ad> => ad !== null);

        const finalAds: PublicAd[] = verifiedAds.map(({ createdAt: _, ...ad }) => ad);

        // Update module-level cache for instant 0ms restoration on page transitions
        inMemoryAds.set(targetPage, finalAds);

        if (isMounted) {
          setAds(finalAds);
          setLoaded(true);
        }
      },
      (error) => {
        console.warn("Firestore ad subscription error, falling back to serve API:", error);
        void fetch(
          `/api/ads/serve?page=${encodeURIComponent(targetPage)}&isStatic=true&count=${Math.max(count, 6)}`,
          { cache: "no-store" },
        )
          .then((res) => (res.ok ? res.json() : null))
          .then(async (data) => {
            if (!data || !isMounted) return;
            const fetched: PublicAd[] =
              Array.isArray(data.ads) && data.ads.length > 0 ? data.ads : data.ad ? [data.ad] : [];
            const valid = fetched.filter(
              (a) =>
                (a.adType === "banner" || a.adType === "product" || (!a.adType && a.isStatic)) &&
                typeof a.mediaUrl === "string" &&
                a.mediaUrl.trim().length > 0 &&
                !isMediaKnownBroken(a.mediaUrl),
            );

            const checkResults = await Promise.all(
              valid.map(async (ad) => {
                const ok = await verifyMediaAccessible(ad.mediaUrl, ad.mediaType);
                return ok ? ad : null;
              }),
            );
            const verified = checkResults.filter((ad): ad is NonNullable<typeof ad> => ad !== null);

            inMemoryAds.set(targetPage, verified);
            setAds(verified);
            setLoaded(true);
          })
          .catch((err) => console.error("Fallback ads fetch failed:", err));
      },
    );

    return () => {
      isMounted = false;
      unsub();
    };
  }, [targetPage, count]);

  const displayAds = ads.filter((ad) => !failedAdIds.has(ad.id));

  // View (Impression) tracking for actually rendered static ads
  useEffect(() => {
    if (displayAds.length > 0) {
      for (const ad of displayAds) {
        if (!trackedViewsGlobal.has(ad.id)) {
          trackedViewsGlobal.add(ad.id);
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
  }, [displayAds]);

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
  if (!loaded || displayAds.length === 0) {
    return null;
  }

  const bannerAds = displayAds.filter(
    (ad) =>
      ad.adType === "banner" || (!ad.adType && (!ad.staticType || ad.staticType === "banner")),
  );
  const productAds = displayAds.filter(
    (ad) => ad.adType === "product" || (!ad.adType && ad.staticType === "product_card"),
  );

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
      {displayBanners.length > 0 && (
        <BannerCarousel
          ads={displayBanners}
          onAdClick={handleAdClick}
          onMediaError={handleMediaError}
        />
      )}
      {displayProducts.length > 0 && (
        <ProductCarousel
          ads={displayProducts}
          onAdClick={handleAdClick}
          onMediaError={handleMediaError}
        />
      )}
    </aside>
  );
}

/**
 * Reliable Video Player for Static / Banner Ads
 * Forces muted, loop, playsInline and triggers programmatic .play() with IntersectionObserver.
 */
function StaticAdVideo({
  src,
  className,
  onError,
}: {
  src: string;
  className?: string;
  onError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    el.defaultMuted = true;
    el.muted = true;

    const playVideo = () => {
      const p = el.play();
      if (p !== undefined) {
        p.catch(() => {
          // Autoplay policy prevented playback until user interaction
        });
      }
    };

    playVideo();

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              playVideo();
            } else {
              el.pause();
            }
          }
        },
        { threshold: 0.2 },
      );
      observer.observe(el);
    }

    return () => {
      if (observer) observer.disconnect();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      src={src}
      autoPlay
      loop
      muted
      playsInline
      onError={onError}
      className={className}
    />
  );
}

/**
 * Auto-rotating Carousel for Banner Ads (5s timeout cycle, hover pause, controls, dots)
 */
function BannerCarousel({
  ads,
  onAdClick,
  onMediaError,
}: {
  ads: PublicAd[];
  onAdClick: (id: string) => void;
  onMediaError: (id: string, mediaUrl: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-advance every 5 seconds (5000ms)
  useEffect(() => {
    if (ads.length <= 1 || isPaused) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % ads.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [ads.length, isPaused]);

  // Keep index within bounds if ads list changes
  useEffect(() => {
    if (currentIndex >= ads.length) {
      setCurrentIndex(0);
    }
  }, [ads.length, currentIndex]);

  // Track impression for active carousel slide
  useEffect(() => {
    const activeAd = ads[currentIndex];
    if (activeAd && !trackedViewsGlobal.has(activeAd.id)) {
      trackedViewsGlobal.add(activeAd.id);
      void fetch("/api/ads/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId: activeAd.id, event: "view" }),
        keepalive: true,
      }).catch(() => {});
    }
  }, [ads, currentIndex]);

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + ads.length) % ads.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % ads.length);
  };

  const currentAd = ads[currentIndex];
  if (!currentAd) return null;

  return (
    <div
      className="relative w-full group"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      <StaticBannerCard
        key={currentAd.id}
        ad={currentAd}
        onAdClick={onAdClick}
        onMediaError={onMediaError}
      />

      {/* Carousel Navigation Controls (when multiple ads exist) */}
      {ads.length > 1 && (
        <>
          {/* Subtle Slide Counter */}
          <div className="absolute top-2 right-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono font-bold text-muted-foreground backdrop-blur-sm">
            {currentIndex + 1} / {ads.length}
          </div>

          {/* Prev Button */}
          {/* <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous advertisement"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm transition hover:bg-black/90 hover:scale-105 shadow-md opacity-75 group-hover:opacity-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button> */}

          {/* Next Button */}
          {/* <button
            type="button"
            onClick={handleNext}
            aria-label="Next advertisement"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm transition hover:bg-black/90 hover:scale-105 shadow-md opacity-75 group-hover:opacity-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button> */}

          {/* Indicators Bar with Dots */}
          <div className="mt-2 flex items-center justify-center gap-1.5">
            {ads.map((ad, idx) => (
              <button
                key={ad.id}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCurrentIndex(idx);
                }}
                aria-label={`Go to ad ${idx + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  idx === currentIndex
                    ? "w-6 bg-primary"
                    : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Auto-rotating Carousel for Product Ads (5s timeout cycle, hover pause, controls, dots)
 */
function ProductCarousel({
  ads,
  onAdClick,
  onMediaError,
}: {
  ads: PublicAd[];
  onAdClick: (id: string) => void;
  onMediaError: (id: string, mediaUrl: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-advance every 5 seconds (5000ms)
  useEffect(() => {
    if (ads.length <= 1 || isPaused) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % ads.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [ads.length, isPaused]);

  // Keep index within bounds if ads list changes
  useEffect(() => {
    if (currentIndex >= ads.length) {
      setCurrentIndex(0);
    }
  }, [ads.length, currentIndex]);

  // Track impression for active carousel slide
  useEffect(() => {
    const activeAd = ads[currentIndex];
    if (activeAd && !trackedViewsGlobal.has(activeAd.id)) {
      trackedViewsGlobal.add(activeAd.id);
      void fetch("/api/ads/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId: activeAd.id, event: "view" }),
        keepalive: true,
      }).catch(() => {});
    }
  }, [ads, currentIndex]);

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + ads.length) % ads.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % ads.length);
  };

  const currentAd = ads[currentIndex];
  if (!currentAd) return null;

  return (
    <div
      className="relative max-w-xs mx-auto w-full group"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      <StaticProductCard
        key={currentAd.id}
        ad={currentAd}
        onAdClick={onAdClick}
        onMediaError={onMediaError}
      />

      {/* Carousel Navigation Controls (when multiple product ads exist) */}
      {ads.length > 1 && (
        <>
          {/* Subtle Slide Counter */}
          <div className="absolute top-2 right-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono font-bold text-muted-foreground backdrop-blur-sm">
            {currentIndex + 1} / {ads.length}
          </div>

          {/* Prev Button */}
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous product advertisement"
            className="absolute left-2 top-1/3 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm transition hover:bg-black/90 hover:scale-105 shadow-md opacity-75 group-hover:opacity-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Next Button */}
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next product advertisement"
            className="absolute right-2 top-1/3 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-sm transition hover:bg-black/90 hover:scale-105 shadow-md opacity-75 group-hover:opacity-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Indicators Bar with Dots */}
          <div className="mt-2 flex items-center justify-center gap-1.5">
            {ads.map((ad, idx) => (
              <button
                key={ad.id}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCurrentIndex(idx);
                }}
                aria-label={`Go to product ${idx + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  idx === currentIndex
                    ? "w-6 bg-primary"
                    : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StaticBannerCard({
  ad,
  onAdClick,
  onMediaError,
}: {
  ad: PublicAd;
  onAdClick: (id: string) => void;
  onMediaError: (id: string, mediaUrl: string) => void;
}) {
  // Static banner ad space: 3:1 aspect ratio (or 16:9 if specified), with media cropped to fit
  const aspectClass = ad.aspectRatio === "16:9" ? "aspect-video" : "aspect-[3/1]";

  const content = (
    <div className="group/card relative w-full overflow-hidden rounded-xl border border-primary/20 bg-card shadow-md transition hover:border-primary/40">
      {/* Top subtle sponsored tag */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[7px] uppercase tracking-widest text-primary backdrop-blur-sm">
        <Sparkles className="h-1.5 w-1.5 animate-pulse" />
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
          <StaticAdVideo
            src={ad.mediaUrl}
            onError={() => onMediaError(ad.id, ad.mediaUrl)}
            className="h-full w-full object-cover object-center"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.mediaUrl}
            alt={ad.title}
            loading="lazy"
            onError={() => onMediaError(ad.id, ad.mediaUrl)}
            className="h-full w-full object-cover object-center transition-transform duration-300 group-hover/card:scale-[1.01]"
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

function StaticProductCard({
  ad,
  onAdClick,
  onMediaError,
}: {
  ad: PublicAd;
  onAdClick: (id: string) => void;
  onMediaError: (id: string, mediaUrl: string) => void;
}) {
  const cardContent = (
    <div className="group/card relative flex h-full flex-col overflow-hidden rounded-xl border border-primary/20 bg-card shadow-md transition hover:border-primary/40">
      {/* Top Sponsored tag */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[7px] uppercase tracking-widest text-primary backdrop-blur-sm">
        <Sparkles className="h-1.5 w-1.5 animate-pulse" />
        <span>Featured</span>
      </div>

      {/* Media thumbnail */}
      <div className="relative aspect-square w-full overflow-hidden bg-black/30">
        {ad.mediaType === "video" ? (
          <StaticAdVideo
            src={ad.mediaUrl}
            onError={() => onMediaError(ad.id, ad.mediaUrl)}
            className="h-full w-full object-cover object-center"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.mediaUrl}
            alt={ad.title}
            loading="lazy"
            onError={() => onMediaError(ad.id, ad.mediaUrl)}
            className="h-full w-full object-cover object-center transition-transform duration-300 group-hover/card:scale-[1.03]"
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
