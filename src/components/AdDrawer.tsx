"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import type { AllowedTargetPage, PublicAd } from "@/lib/firebase-admin";
import { isMediaKnownBroken, markMediaUrlFailed, verifyMediaAccessible } from "@/lib/media-verify";

interface AdDrawerProps {
  targetPage: AllowedTargetPage;
  className?: string;
  /** Delay in ms after page is ready before fetching and showing drawer (default: 3000ms) */
  delayMs?: number;
  /** Whether the host page and its data are fully loaded/ready (default: true) */
  ready?: boolean;
}

const DISMISSED_ADS_KEY = "ad_drawer_dismissed_ads";
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

interface DismissedAdsMap {
  [adId: string]: number; // timestamp in ms when dismissed
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    // Prefer localStorage so the 24-hour dismissal persists across page visits and tab closes
    if (window.localStorage) return window.localStorage;
  } catch {
    // LocalStorage might be disabled or restricted
  }
  try {
    if (window.sessionStorage) return window.sessionStorage;
  } catch {
    return null;
  }
  return null;
}

function getDismissedAdMap(): DismissedAdsMap {
  const storage = getStorage();
  if (!storage) return {};
  try {
    let raw = storage.getItem(DISMISSED_ADS_KEY);

    // One-time migration: check legacy sessionStorage if localStorage doesn't have data yet
    if (
      !raw &&
      typeof window !== "undefined" &&
      window.sessionStorage &&
      storage !== window.sessionStorage
    ) {
      try {
        raw = window.sessionStorage.getItem(DISMISSED_ADS_KEY);
        if (raw) {
          window.sessionStorage.removeItem(DISMISSED_ADS_KEY);
        }
      } catch {
        // Ignore session storage errors
      }
    }

    if (!raw) return {};

    const parsed = JSON.parse(raw);
    const now = Date.now();
    const result: DismissedAdsMap = {};

    if (Array.isArray(parsed)) {
      // Legacy format migration: array of string IDs -> set timestamp to now
      for (const item of parsed) {
        if (typeof item === "string" && item) {
          result[item] = now;
        } else if (item && typeof item === "object" && item.id) {
          const ts = typeof item.timestamp === "number" ? item.timestamp : now;
          if (now - ts < DISMISS_DURATION_MS) {
            result[item.id] = ts;
          }
        }
      }
    } else if (parsed && typeof parsed === "object") {
      for (const [id, ts] of Object.entries(parsed)) {
        // Keep only entries that are within the 24h window
        if (typeof ts === "number" && now - ts < DISMISS_DURATION_MS) {
          result[id] = ts;
        }
      }
    }

    return result;
  } catch {
    return {};
  }
}

function getDismissedAdIds(): string[] {
  const map = getDismissedAdMap();
  const storage = getStorage();
  if (storage) {
    try {
      // Re-save pruned map so expired entries (>24h) are completely removed from storage
      storage.setItem(DISMISSED_ADS_KEY, JSON.stringify(map));
    } catch {
      // Ignore storage quota or security errors
    }
  }
  return Object.keys(map);
}

function markAdDismissedThisSession(adId: string): void {
  if (typeof window === "undefined" || !adId) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    const map = getDismissedAdMap();
    map[adId] = Date.now();
    storage.setItem(DISMISSED_ADS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota or security errors
  }
}

export function AdDrawer({
  targetPage,
  className = "",
  delayMs = 3000,
  ready = true,
}: AdDrawerProps) {
  const [adsList, setAdsList] = useState<PublicAd[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Do not start delay timer or API fetch if page data is not ready yet
    if (!ready) {
      return;
    }

    async function fetchAds(): Promise<void> {
      try {
        const dismissed = getDismissedAdIds();
        const excludeParam =
          dismissed.length > 0 ? `&exclude=${encodeURIComponent(dismissed.join(","))}` : "";
        const seed = Math.random().toString(36).substring(2, 10);

        const res = await fetch(
          `/api/ads/serve?page=${encodeURIComponent(targetPage)}&format=drawer&type=popup&seed=${encodeURIComponent(seed)}${excludeParam}`,
          { cache: "no-store" },
        );

        if (!res.ok) return;

        const data = await res.json();
        // Support both data.ads array and data.ad single object
        const allFetched: PublicAd[] =
          Array.isArray(data.ads) && data.ads.length > 0 ? data.ads : data.ad ? [data.ad] : [];

        // Safety filter in case server didn't exclude or client has updated session storage;
        // Strictly filter to only popup ads (or legacy non-static ads)
        const currentDismissed = new Set(getDismissedAdIds());
        const candidateAds = allFetched
          .filter((ad) => {
            if (ad.adType && ad.adType !== "popup") return false;
            if (!ad.adType && ad.isStatic) return false;
            if (currentDismissed.has(ad.id)) return false;
            // 1. Strict check: mediaUrl must not be empty or whitespace (if cleared in database, skip)
            if (!ad.mediaUrl || typeof ad.mediaUrl !== "string" || !ad.mediaUrl.trim())
              return false;
            if (isMediaKnownBroken(ad.mediaUrl)) return false;
            return true;
          })
          .slice(0, 5);

        // 2. Strict media verification: verify media file exists in storage and is accessible
        const checkResults = await Promise.all(
          candidateAds.map(async (ad) => {
            const ok = await verifyMediaAccessible(ad.mediaUrl, ad.mediaType);
            return ok ? ad : null;
          }),
        );
        const verifiedAds = checkResults
          .filter((ad): ad is NonNullable<typeof ad> => ad !== null)
          .slice(0, 3);

        if (isMounted && verifiedAds.length > 0) {
          setAdsList(verifiedAds);
          setCurrentIndex(0);
          setIsRendered(true);
          // Short delay so slide-up animation kicks in smoothly
          animTimerRef.current = setTimeout(() => {
            if (isMounted) setIsVisible(true);
          }, 200);
        } else if (isMounted) {
          setIsRendered(false);
          setIsVisible(false);
        }
      } catch (err) {
        console.error("AdDrawer fetch error:", err);
      }
    }

    function scheduleFetch() {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
      delayTimerRef.current = setTimeout(() => {
        if (isMounted) {
          void fetchAds();
        }
      }, delayMs);
    }

    // Ensure the window/document has completed loading before starting the 3-second delay
    if (typeof document !== "undefined" && document.readyState !== "complete") {
      const handleWindowLoad = () => {
        scheduleFetch();
      };
      window.addEventListener("load", handleWindowLoad, { once: true });
      return () => {
        isMounted = false;
        window.removeEventListener("load", handleWindowLoad);
        if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
      };
    } else {
      scheduleFetch();
      return () => {
        isMounted = false;
        if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
      };
    }
  }, [targetPage, ready, delayMs]);

  // Handle drawer close: dismiss the closed ad for the session & show next active ad in sequence
  const handleClose = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }

    const closedAd = adsList[currentIndex];
    if (closedAd) {
      markAdDismissedThisSession(closedAd.id);
    }

    setIsVisible(false);

    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (nextTimerRef.current) clearTimeout(nextTimerRef.current);

    const dismissed = new Set(getDismissedAdIds());
    let nextIdx = currentIndex + 1;
    const maxAdsToShow = Math.min(adsList.length, 3);

    while (nextIdx < maxAdsToShow) {
      const candidateAd = adsList[nextIdx];
      if (candidateAd && dismissed.has(candidateAd.id)) {
        nextIdx++;
      } else {
        break;
      }
    }

    if (nextIdx < maxAdsToShow) {
      // Wait for slide-down animation to finish (350ms), then load next active ad and slide up
      closeTimerRef.current = setTimeout(() => {
        setCurrentIndex(nextIdx);
        setIsMuted(false);

        nextTimerRef.current = setTimeout(() => {
          setIsVisible(true);
        }, 100);
      }, 350);
    } else {
      // Reached end of active ads for this session
      closeTimerRef.current = setTimeout(() => {
        setIsRendered(false);
        setAdsList([]);
      }, 350);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const handleMediaError = (adId: string, mediaUrl?: string) => {
    if (mediaUrl) {
      markMediaUrlFailed(mediaUrl);
    }
    markAdDismissedThisSession(adId);
    handleClose();
  };

  const currentAd = adsList[currentIndex] || null;
  const trackedViewsRef = useRef<Set<string>>(new Set());

  // Record impression / view when an ad becomes visible to the user
  useEffect(() => {
    if (isVisible && currentAd && !trackedViewsRef.current.has(currentAd.id)) {
      trackedViewsRef.current.add(currentAd.id);
      try {
        void fetch("/api/ads/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adId: currentAd.id, event: "view" }),
          keepalive: true,
        });
      } catch {
        // Ignore tracking errors
      }
    }
  }, [isVisible, currentAd]);

  // Record click event when user interacts with Click-Through URL
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

  useEffect(() => {
    if (videoRef.current && currentAd?.mediaType === "video") {
      videoRef.current.muted = isMuted;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // If browser policy blocks autoplay with sound without prior user interaction,
          // mute temporarily so the video does not stall
          if (videoRef.current && !videoRef.current.muted) {
            videoRef.current.muted = true;
            setIsMuted(true);
            void videoRef.current.play();
          }
        });
      }
    }
  }, [currentIndex, currentAd, isMuted]);

  if (!isRendered || !currentAd) {
    return null;
  }

  function renderMediaContent() {
    if (!currentAd) return null;

    if (currentAd.mediaType === "video") {
      return (
        <div className="relative w-full aspect-video bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            key={currentAd.id}
            src={currentAd.mediaUrl}
            playsInline
            autoPlay
            loop
            muted={isMuted}
            onError={() => handleMediaError(currentAd.id, currentAd.mediaUrl)}
            className="w-full h-full object-cover"
          />
        </div>
      );
    }

    // Default: Image
    const aspectClass =
      currentAd.aspectRatio === "1:1"
        ? "aspect-square"
        : currentAd.aspectRatio === "3:1"
          ? "aspect-[3/1]"
          : "aspect-video";

    return (
      <div
        className={`relative w-full ${aspectClass} max-h-56 bg-secondary/20 flex items-center justify-center overflow-hidden`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={currentAd.id}
          src={currentAd.mediaUrl}
          alt={currentAd.title}
          loading="lazy"
          onError={() => handleMediaError(currentAd.id, currentAd.mediaUrl)}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>
    );
  }

  return (
    <aside
      aria-label="Promoted advertisement"
      className={`fixed bottom-0 left-0 right-0 z-50 pointer-events-none p-3 sm:p-4 flex justify-center transition-all duration-350 ease-out ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      } ${className}`}
    >
      <div className="pointer-events-auto relative w-full max-w-md surface metallic shadow-2xl overflow-hidden rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-md">
        {/* Subtle top gold accent bar */}
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-80" />

        {/* Header: Sponsored badge & Close button */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/50 bg-secondary/30">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[7px] tracking-[0.2em] text-primary uppercase">
              <Sparkles className="h-3 w-3 text-primary animate-pulse" />
              <span>Sponsored</span>
            </div>
            {adsList.length > 1 && (
              <span className="text-[10px] font-semibold text-muted-foreground/80 tracking-normal">
                ({currentIndex + 1} of {Math.min(adsList.length, 3)})
              </span>
            )}
          </div>

          <button
            onClick={handleClose}
            aria-label="Close advertisement"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Media Container */}
        <div className="relative w-full bg-black/40 overflow-hidden">
          {currentAd.clickUrl ? (
            <a
              href={currentAd.clickUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleAdClick(currentAd.id)}
              className="block group cursor-pointer"
            >
              {renderMediaContent()}
            </a>
          ) : (
            <div>{renderMediaContent()}</div>
          )}

          {/* Video mute/unmute control overlay */}
          {currentAd.mediaType === "video" && (
            <button
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute video" : "Mute video"}
              className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/70 text-white/90 hover:text-white hover:bg-black/90 backdrop-blur-sm transition-all z-10"
            >
              {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {/* Footer: Ad Info and CTA */}
        <div className="p-3.5 flex items-center justify-between gap-3 bg-card">
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-foreground truncate">{currentAd.title}</h4>
            {currentAd.description && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {currentAd.description}
              </p>
            )}
          </div>

          {currentAd.clickUrl && (
            <a
              href={currentAd.clickUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleAdClick(currentAd.id)}
              className="btn-gold shrink-0 px-3 py-1.5 text-[11px] flex items-center gap-1.5"
            >
              <span>Learn More</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}
