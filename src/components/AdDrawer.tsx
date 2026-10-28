"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import type { AllowedTargetPage, PublicAd } from "@/lib/firebase-admin";

interface AdDrawerProps {
  targetPage: AllowedTargetPage;
  className?: string;
}

export function AdDrawer({ targetPage, className = "" }: AdDrawerProps) {
  const [adsList, setAdsList] = useState<PublicAd[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;
    let animTimer: ReturnType<typeof setTimeout> | null = null;

    async function fetchAds(): Promise<void> {
      try {
        // Unique seed per page load ensures fresh deterministic rotation on each refresh
        const seed = Math.random().toString(36).substring(2, 10);

        const res = await fetch(
          `/api/ads/serve?page=${encodeURIComponent(targetPage)}&seed=${encodeURIComponent(seed)}`,
          { cache: "no-store" },
        );

        if (!res.ok) return;

        const data = await res.json();
        // Support both data.ads array and data.ad single object, capped at max 3 ads
        const fetchedAds: PublicAd[] =
          Array.isArray(data.ads) && data.ads.length > 0
            ? data.ads.slice(0, 3)
            : data.ad
              ? [data.ad]
              : [];

        if (isMounted && fetchedAds.length > 0) {
          setAdsList(fetchedAds);
          setCurrentIndex(0);
          setIsRendered(true);
          // Short delay so slide-up animation kicks in smoothly
          animTimer = setTimeout(() => {
            if (isMounted) setIsVisible(true);
          }, 200);
        }
      } catch (err) {
        console.error("AdDrawer fetch error:", err);
      }
    }

    void fetchAds();

    return () => {
      isMounted = false;
      if (animTimer) clearTimeout(animTimer);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
    };
  }, [targetPage]);

  // Handle drawer close: if more ads exist in queue (up to max 3), show next ad after close
  const handleClose = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }

    setIsVisible(false);

    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (nextTimerRef.current) clearTimeout(nextTimerRef.current);

    const nextIdx = currentIndex + 1;
    const maxAdsToShow = Math.min(adsList.length, 3);

    if (nextIdx < maxAdsToShow) {
      // Wait for slide-down animation to finish (350ms), then load next ad and slide up
      closeTimerRef.current = setTimeout(() => {
        setCurrentIndex(nextIdx);
        setIsMuted(false);

        nextTimerRef.current = setTimeout(() => {
          setIsVisible(true);
        }, 100);
      }, 350);
    } else {
      // Reached end of ads for this visit
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

  const currentAd = adsList[currentIndex] || null;

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
  }, [currentIndex, currentAd]);

  if (!isRendered || !currentAd) {
    return null;
  }

  const maxAdsToShow = Math.min(adsList.length, 3);

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
          ? "aspect-3/1"
          : "aspect-16/9";

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

        {/* Header: Sponsored badge, optional sequence counter & Close button */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/50 bg-secondary/30">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.2em] text-primary uppercase">
              <Sparkles className="h-3 w-3 text-primary animate-pulse" />
              <span>Sponsored</span>
            </div>
            {maxAdsToShow > 1 && (
              <span className="text-[10px] font-semibold text-muted-foreground/80 tracking-normal">
                ({currentIndex + 1} of {maxAdsToShow})
              </span>
            )}
          </div>

          <button
            onClick={handleClose}
            aria-label="Close advertisement"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
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
