import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { fetchUserAnalytics } from "@/lib/user-analytics";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

// POST rather than GET: public/sw.js caches every GET response and serves it
// offline, which would hand these numbers out without the key.
export async function POST(req: Request) {
  const accessKey = process.env.ANALYTICS_ACCESS_KEY;
  if (!accessKey) {
    return NextResponse.json({ error: "Analytics isn't set up yet." }, { status: 503 });
  }

  const given = req.headers.get("x-analytics-key") ?? "";
  if (!timingSafeEqual(sha256(given), sha256(accessKey))) {
    return NextResponse.json({ error: "That access key isn't right." }, { status: 401 });
  }

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json(
      { error: "FIREBASE_SERVICE_ACCOUNT_KEY isn't set on the server." },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json(await fetchUserAnalytics(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[User analytics]:", err);
    return NextResponse.json({ error: "Couldn't load data from Firebase." }, { status: 500 });
  }
}
