import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { auth, db } from "@/lib/firebase";

export type AdminRole = "admin" | "superadmin";

export interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: AdminRole;
  tokenVersion: number;
  createdAt: string; // ISO 8601 string
  updatedAt: string; // ISO 8601 string
  lastLoginAt?: string | null;
}

export const ALLOWED_TARGET_PAGES = ["/", "/settle/[id]", "/history"] as const;
export type AllowedTargetPage = (typeof ALLOWED_TARGET_PAGES)[number];

export type MediaType = "image" | "video";
export type StaticAdType = "banner" | "product_card";
export type AdType = "banner" | "product" | "popup";

export interface PublicAd {
  id: string;
  title: string;
  description?: string;
  mediaType: MediaType;
  mediaUrl: string;
  mediaWidth?: number;
  mediaHeight?: number;
  aspectRatio?: string;
  clickUrl?: string | null;
  adType?: AdType;
  isStatic?: boolean;
  staticType?: StaticAdType | null;
}

export interface Ad {
  id: string;
  title: string;
  description?: string;
  mediaType: MediaType;
  mediaUrl: string;
  storagePath: string;
  mediaWidth?: number;
  mediaHeight?: number;
  aspectRatio?: string;
  targetPages: string[];
  isActive: boolean;
  adType?: AdType;
  isStatic?: boolean;
  staticType?: StaticAdType | null;
  startDate?: string | null;
  endDate?: string | null;
  clickUrl?: string | null;
  views?: number;
  clicks?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

const ADMIN_COLLECTION = "admin";
const ADS_COLLECTION = "ads";

// Ensure auth session is ready for Firestore rules
async function ensureAuth() {
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch (e) {
      // Ignore if already signed in or not required
    }
  }
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      clean[key] = val;
    }
  }
  return clean;
}

const serverMediaStatusCache = new Map<string, { ok: boolean; timestamp: number }>();
const SERVER_MEDIA_CACHE_TTL_MS = 60 * 1000;

export async function isMediaUrlAccessibleServer(url?: string | null): Promise<boolean> {
  if (!url || typeof url !== "string" || !url.trim()) return false;
  const trimmed = url.trim();

  const cached = serverMediaStatusCache.get(trimmed);
  if (cached && Date.now() - cached.timestamp < SERVER_MEDIA_CACHE_TTL_MS) {
    return cached.ok;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let res = await fetch(trimmed, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);

    // 404 or 410 indicates the media file was deleted or does not exist in storage
    if (res.status === 404 || res.status === 410) {
      serverMediaStatusCache.set(trimmed, { ok: false, timestamp: Date.now() });
      return false;
    }

    let ok = res.ok;
    if (!ok) {
      // Fallback: try GET with Range bytes=0-0 in case HEAD is not supported by bucket
      const getController = new AbortController();
      const getTimeout = setTimeout(() => getController.abort(), 6000);
      res = await fetch(trimmed, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: getController.signal,
      });
      clearTimeout(getTimeout);
      if (res.status === 404 || res.status === 410) {
        serverMediaStatusCache.set(trimmed, { ok: false, timestamp: Date.now() });
        return false;
      }
      ok = res.ok || res.status === 206;
    }

    serverMediaStatusCache.set(trimmed, { ok, timestamp: Date.now() });
    return ok;
  } catch {
    // On transient network error or timeout, do not permanently cache false.
    // If the file is 404, the client <video> or <img> onError will catch it.
    return true;
  }
}

// -------------------------------------------------------------------------
// Firestore Data Access via @/lib/firebase (No .json, No ADC needed)
// -------------------------------------------------------------------------
export const adminDb = {
  // Admin Users (Collection: 'admin')
  async getAdminUserByEmail(email: string): Promise<AdminUser | null> {
    await ensureAuth();
    const normalized = email.toLowerCase().trim();
    const q = query(collection(db, ADMIN_COLLECTION), where("email", "==", normalized), limit(1));
    const snap = await getDocs(q);

    if (snap.empty || !snap.docs[0]) {
      return null;
    }

    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...(docSnap.data() as Omit<AdminUser, "id">) };
  },

  async getAdminUserById(id: string): Promise<AdminUser | null> {
    await ensureAuth();
    const ref = doc(db, ADMIN_COLLECTION, id);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      return null;
    }

    return { id: snap.id, ...(snap.data() as Omit<AdminUser, "id">) };
  },

  async createAdminUser(
    user: Omit<AdminUser, "id" | "tokenVersion" | "createdAt" | "updatedAt">,
  ): Promise<AdminUser> {
    await ensureAuth();
    const id = `admin_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    const fullUser: AdminUser = {
      ...user,
      id,
      email: user.email.toLowerCase().trim(),
      tokenVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    const ref = doc(db, ADMIN_COLLECTION, id);
    const { id: _, ...dataToSave } = fullUser;
    await setDoc(ref, stripUndefined(dataToSave));

    return fullUser;
  },

  async updateAdminUser(id: string, updates: Partial<AdminUser>): Promise<AdminUser | null> {
    await ensureAuth();
    const now = new Date().toISOString();
    const ref = doc(db, ADMIN_COLLECTION, id);
    await updateDoc(ref, stripUndefined({ ...updates, updatedAt: now }));

    return this.getAdminUserById(id);
  },

  async revokeAdminSessions(id: string): Promise<boolean> {
    const user = await this.getAdminUserById(id);
    if (!user) return false;
    await this.updateAdminUser(id, { tokenVersion: user.tokenVersion + 1 });
    return true;
  },

  // Ads (Collection: 'ads')
  async listAds(filters?: {
    search?: string;
    isActive?: boolean;
    mediaType?: MediaType;
    adType?: AdType;
    targetPage?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ ads: Ad[]; total: number }> {
    await ensureAuth();
    const snap = await getDocs(collection(db, ADS_COLLECTION));
    const allAds: Ad[] = snap.docs.map((d) => {
      const data = d.data();
      const rawType = data.adType || data.type;
      let resolvedType: AdType = "popup";
      if (rawType === "banner" || rawType === "product" || rawType === "popup") {
        resolvedType = rawType;
      } else if (data.isStatic) {
        resolvedType =
          data.staticType === "product_card" || data.staticType === "product"
            ? "product"
            : "banner";
      } else {
        resolvedType = "popup";
      }

      const isStatic =
        typeof data.isStatic === "boolean" ? data.isStatic : resolvedType !== "popup";
      const staticType =
        data.staticType === "banner" || data.staticType === "product_card"
          ? data.staticType
          : resolvedType === "product"
            ? "product_card"
            : resolvedType === "banner"
              ? "banner"
              : null;

      return {
        id: d.id,
        ...(data as Omit<Ad, "id">),
        adType: resolvedType,
        isStatic,
        staticType,
        views: typeof data.views === "number" ? data.views : 0,
        clicks: typeof data.clicks === "number" ? data.clicks : 0,
      };
    });

    allAds.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

    let filtered = allAds;

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(
        (ad) =>
          ad.title.toLowerCase().includes(q) ||
          (ad.description && ad.description.toLowerCase().includes(q)),
      );
    }

    if (typeof filters?.isActive === "boolean") {
      filtered = filtered.filter((ad) => ad.isActive === filters.isActive);
    }

    if (filters?.mediaType) {
      filtered = filtered.filter((ad) => ad.mediaType === filters.mediaType);
    }

    if (filters?.adType) {
      filtered = filtered.filter((ad) => ad.adType === filters.adType);
    }

    if (filters?.targetPage) {
      filtered = filtered.filter((ad) => ad.targetPages.includes(filters.targetPage!));
    }

    const total = filtered.length;
    const offset = filters?.offset || 0;
    const limitCount = filters?.limit || 50;
    const paged = filtered.slice(offset, offset + limitCount);

    return { ads: paged, total };
  },

  async getAdById(id: string): Promise<Ad | null> {
    await ensureAuth();
    const ref = doc(db, ADS_COLLECTION, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    const rawType = data.adType || data.type;
    let resolvedType: AdType = "popup";
    if (rawType === "banner" || rawType === "product" || rawType === "popup") {
      resolvedType = rawType;
    } else if (data.isStatic) {
      resolvedType =
        data.staticType === "product_card" || data.staticType === "product" ? "product" : "banner";
    } else {
      resolvedType = "popup";
    }

    const isStatic = typeof data.isStatic === "boolean" ? data.isStatic : resolvedType !== "popup";
    const staticType =
      data.staticType === "banner" || data.staticType === "product_card"
        ? data.staticType
        : resolvedType === "product"
          ? "product_card"
          : resolvedType === "banner"
            ? "banner"
            : null;

    return {
      id: snap.id,
      ...(data as Omit<Ad, "id">),
      adType: resolvedType,
      isStatic,
      staticType,
      views: typeof data.views === "number" ? data.views : 0,
      clicks: typeof data.clicks === "number" ? data.clicks : 0,
    };
  },

  async createAd(adData: Omit<Ad, "id" | "createdAt" | "updatedAt">): Promise<Ad> {
    await ensureAuth();
    const id = `ad_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const adType: AdType =
      adData.adType ||
      (adData.isStatic ? (adData.staticType === "product_card" ? "product" : "banner") : "popup");
    const isStatic = adType !== "popup";
    const staticType =
      adType === "product" ? "product_card" : adType === "banner" ? "banner" : null;

    const newAd: Ad = {
      views: 0,
      clicks: 0,
      ...adData,
      adType,
      isStatic,
      staticType,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const ref = doc(db, ADS_COLLECTION, id);
    const { id: _, ...dataToSave } = newAd;
    await setDoc(ref, stripUndefined(dataToSave));

    return newAd;
  },

  async updateAd(id: string, updates: Partial<Ad>): Promise<Ad | null> {
    await ensureAuth();
    const now = new Date().toISOString();

    const cleanUpdates = { ...updates };
    if (cleanUpdates.adType) {
      cleanUpdates.isStatic = cleanUpdates.adType !== "popup";
      cleanUpdates.staticType =
        cleanUpdates.adType === "product"
          ? "product_card"
          : cleanUpdates.adType === "banner"
            ? "banner"
            : null;
    }

    const ref = doc(db, ADS_COLLECTION, id);
    await updateDoc(ref, stripUndefined({ ...cleanUpdates, updatedAt: now }));
    return this.getAdById(id);
  },

  async recordAdView(id: string): Promise<boolean> {
    await ensureAuth();
    try {
      const ref = doc(db, ADS_COLLECTION, id);
      await updateDoc(ref, {
        views: increment(1),
      });
      return true;
    } catch (err) {
      console.error("[Record Ad View Error]:", err);
      return false;
    }
  },

  async recordAdClick(id: string): Promise<boolean> {
    await ensureAuth();
    try {
      const ref = doc(db, ADS_COLLECTION, id);
      await updateDoc(ref, {
        clicks: increment(1),
      });
      return true;
    } catch (err) {
      console.error("[Record Ad Click Error]:", err);
      return false;
    }
  },

  async deleteAd(id: string): Promise<Ad | null> {
    await ensureAuth();
    const ad = await this.getAdById(id);
    if (!ad) return null;
    const ref = doc(db, ADS_COLLECTION, id);
    await deleteDoc(ref);
    return ad;
  },

  async isStoragePathUsed(storagePath: string, excludeAdId?: string): Promise<boolean> {
    const { ads } = await this.listAds({ limit: 1000 });
    return ads.some((ad) => ad.storagePath === storagePath && ad.id !== excludeAdId);
  },

  async getStats() {
    const { ads } = await this.listAds({ limit: 1000 });
    const total = ads.length;
    const active = ads.filter((a) => a.isActive).length;
    const inactive = total - active;
    const images = ads.filter((a) => a.mediaType === "image").length;
    const videos = ads.filter((a) => a.mediaType === "video").length;

    const totalViews = ads.reduce((acc, a) => acc + (a.views || 0), 0);
    const totalClicks = ads.reduce((acc, a) => acc + (a.clicks || 0), 0);
    const ctr = totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(2)) : 0;

    const byPage: Record<string, number> = {
      "/": 0,
      "/settle/[id]": 0,
      "/history": 0,
    };

    for (const ad of ads) {
      for (const page of ad.targetPages) {
        if (byPage[page] !== undefined) {
          byPage[page]++;
        } else {
          byPage[page] = 1;
        }
      }
    }

    const recent = [...ads].sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1)).slice(0, 5);
    const topPerforming = [...ads]
      .sort(
        (a, b) =>
          (b.clicks || 0) * 1000 + (b.views || 0) - ((a.clicks || 0) * 1000 + (a.views || 0)),
      )
      .slice(0, 5);

    return {
      total,
      active,
      inactive,
      images,
      videos,
      totalViews,
      totalClicks,
      ctr,
      byPage,
      recent,
      topPerforming,
    };
  },

  async getServedAdsForPage(
    targetPage: string,
    seed?: string,
    maxCount: number = 3,
    excludeIds: string[] = [],
    filters?: {
      adType?: AdType;
      isStatic?: boolean;
      staticType?: StaticAdType;
    },
  ): Promise<{ ad: PublicAd | null; ads: PublicAd[] }> {
    const { ads } = await this.listAds({ limit: 1000 });
    const now = Date.now();

    const eligible = ads.filter((ad) => {
      if (!ad.isActive) return false;
      if (!ad.targetPages.includes(targetPage)) return false;
      if (excludeIds.includes(ad.id)) return false;

      // Strict mediaUrl check: if mediaUrl is missing or empty (e.g. manually emptied in database)
      if (!ad.mediaUrl || typeof ad.mediaUrl !== "string" || !ad.mediaUrl.trim()) {
        return false;
      }

      // Filter by adType if specified
      if (filters?.adType) {
        if (ad.adType !== filters.adType) return false;
      }

      // Filter by isStatic if specified
      if (typeof filters?.isStatic === "boolean") {
        const adIsStatic = Boolean(ad.isStatic);
        if (adIsStatic !== filters.isStatic) return false;
      }

      // Filter by staticType if specified
      if (filters?.staticType) {
        if (ad.staticType !== filters.staticType) return false;
      }

      if (ad.startDate) {
        const start = new Date(ad.startDate).getTime();
        if (!isNaN(start) && now < start) return false;
      }

      if (ad.endDate) {
        const end = new Date(ad.endDate).getTime();
        if (!isNaN(end) && now > end) return false;
      }

      return true;
    });

    if (eligible.length === 0) {
      return { ad: null, ads: [] };
    }

    // Verify that media file exists and is accessible in storage (not deleted / 404)
    const verifiedResults = await Promise.all(
      eligible.map(async (ad) => {
        const isAccessible = await isMediaUrlAccessibleServer(ad.mediaUrl);
        return isAccessible ? ad : null;
      }),
    );
    const verifiedEligible = verifiedResults.filter(
      (ad): ad is NonNullable<typeof ad> => ad !== null,
    );

    if (verifiedEligible.length === 0) {
      return { ad: null, ads: [] };
    }

    // Deterministic selection/rotation strategy:
    let startIndex = 0;
    if (seed) {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
      }
      startIndex = Math.abs(hash) % verifiedEligible.length;
    } else {
      const hourBucket = Math.floor(now / (1000 * 60 * 60 * 6));
      startIndex = hourBucket % verifiedEligible.length;
    }

    const selectedAds: PublicAd[] = [];
    const countToTake = Math.min(verifiedEligible.length, maxCount);

    for (let i = 0; i < countToTake; i++) {
      const ad = verifiedEligible[(startIndex + i) % verifiedEligible.length];
      if (ad && !selectedAds.some((s) => s.id === ad.id)) {
        selectedAds.push({
          id: ad.id,
          title: ad.title,
          description: ad.description || undefined,
          mediaType: ad.mediaType,
          mediaUrl: ad.mediaUrl,
          mediaWidth: ad.mediaWidth,
          mediaHeight: ad.mediaHeight,
          aspectRatio: ad.aspectRatio,
          clickUrl: ad.clickUrl || null,
          adType: ad.adType,
          isStatic: ad.isStatic ?? ad.adType !== "popup",
          staticType: ad.staticType || null,
        });
      }
    }

    return {
      ad: selectedAds[0] || null,
      ads: selectedAds,
    };
  },

  async getServedAdForPage(targetPage: string, seed?: string): Promise<PublicAd | null> {
    const { ad } = await this.getServedAdsForPage(targetPage, seed, 1);
    return ad;
  },
};
