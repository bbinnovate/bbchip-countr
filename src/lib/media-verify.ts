// Client-side cache of media URL accessibility (true = accessible, false = not found / broken)
const clientMediaCache = new Map<string, boolean>();

/**
 * Manually invalidate or record a broken media URL in the client cache
 */
export function markMediaUrlFailed(url?: string | null): void {
  if (url && typeof url === "string" && url.trim().length > 0) {
    clientMediaCache.set(url.trim(), false);
  }
}

/**
 * Check if a media URL is already known to be broken or empty
 */
export function isMediaKnownBroken(url?: string | null): boolean {
  if (!url || typeof url !== "string" || !url.trim()) return true;
  return clientMediaCache.get(url.trim()) === false;
}

/**
 * Verifies that the media file at `url` exists in storage and is accessible.
 * - For images: Uses new Image() to test load and check for 404/not found.
 * - For videos: Avoids detached off-screen video probes that get throttled or blocked by
 *   browsers (which caused valid video ads to time out and fail). Validates non-empty URL
 *   and relies on the rendered <video> element's onError to catch 404/missing files.
 */
export function verifyMediaAccessible(
  url?: string | null,
  mediaType: "image" | "video" = "image",
  timeoutMs: number = 3500,
): Promise<boolean> {
  if (typeof window === "undefined") {
    // In SSR, do not block or assume false without window
    return Promise.resolve(Boolean(url && typeof url === "string" && url.trim().length > 0));
  }

  if (!url || typeof url !== "string" || !url.trim()) {
    return Promise.resolve(false);
  }

  const trimmed = url.trim();

  // Return cached result if already tested
  if (clientMediaCache.has(trimmed)) {
    return Promise.resolve(clientMediaCache.get(trimmed)!);
  }

  if (mediaType === "video") {
    // If the video URL was previously marked failed, reject it immediately.
    // Otherwise allow the ad to render its native <video> tag, which has an onError
    // handler that immediately dismisses and marks the ad failed if storage returns 404.
    if (clientMediaCache.get(trimmed) === false) {
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const finish = (result: boolean) => {
      if (!settled) {
        settled = true;
        clientMediaCache.set(trimmed, result);
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      finish(false);
    }, timeoutMs);

    const img = new Image();

    const cleanup = () => {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
    };

    img.onload = () => {
      cleanup();
      finish(true);
    };

    img.onerror = () => {
      cleanup();
      finish(false);
    };

    try {
      img.src = trimmed;
      // If image was already cached in browser, complete may be true immediately
      if (img.complete && img.naturalWidth > 0) {
        cleanup();
        finish(true);
      }
    } catch {
      cleanup();
      finish(false);
    }
  });
}
