import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Timestamp } from "firebase-admin/firestore";
import type { DailyCounts } from "./analytics-range";

const TIME_ZONE = "Asia/Kolkata";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Host {
  name: string;
  phone: string;
  playerCode: string;
  joinedDay: string; // YYYY-MM-DD in IST
  games: number;
}

export interface UserAnalytics {
  asOf: string;
  today: string; // YYYY-MM-DD in IST
  totalUsers: number;
  totalGames: number;
  daily: DailyCounts[];
  hosts: Host[];
}

const dayKey = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });

function countByDay(times: number[]) {
  const perDay = new Map<string, number>();
  times.forEach((t) => {
    const day = dayKey(t);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  });
  return perDay;
}

/** Turns timestamps into counts. */
export function summarizeUsage(
  accountsCreated: number[],
  gamesStarted: number[],
  now: number,
): Omit<UserAnalytics, "hosts"> {
  const newUsers = countByDay(accountsCreated);
  const games = countByDay(gamesStarted);

  const today = dayKey(now);
  const daily: DailyCounts[] = [];
  const firstDay = [...newUsers.keys(), ...games.keys()].sort()[0];
  if (firstDay) {
    // Walks plain calendar dates in UTC, so every day is exactly 24 hours.
    let cursor = Date.parse(`${firstDay}T00:00:00Z`);
    while (new Date(cursor).toISOString().slice(0, 10) <= today) {
      const day = new Date(cursor).toISOString().slice(0, 10);
      daily.push({ day, newUsers: newUsers.get(day) ?? 0, games: games.get(day) ?? 0 });
      cursor += DAY_MS;
    }
  }

  return {
    asOf: new Date(now).toISOString(),
    today,
    totalUsers: accountsCreated.length,
    totalGames: gamesStarted.length,
    daily,
  };
}

const serviceAccount = () => JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? "");

function adminApp() {
  return getApps()[0] ?? initializeApp({ credential: cert(serviceAccount()) });
}

// Calls the REST API directly because firebase-admin/auth crashes on Vercel when
// it loads: its jwks-rsa dependency require()s jose, which is ESM-only.
async function fetchAccountsCreated() {
  const projectId = serviceAccount().project_id;
  const { access_token } = await adminApp().options.credential!.getAccessToken();
  const createdAt: number[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ maxResults: "1000" });
    if (pageToken) params.set("nextPageToken", pageToken);
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet?${params}`,
      { headers: { Authorization: `Bearer ${access_token}` }, cache: "no-store" },
    );
    if (!res.ok) throw new Error(`Listing accounts failed with status ${res.status}`);
    const page: { users?: { createdAt: string }[]; nextPageToken?: string } = await res.json();
    page.users?.forEach((user) => createdAt.push(Number(user.createdAt)));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return createdAt;
}

async function fetchGames() {
  const snap = await getFirestore(adminApp())
    .collection("sessions")
    .select("startedAt", "hostUid")
    .get();
  return snap.docs.flatMap((doc) => {
    const startedAt = doc.get("startedAt") as Timestamp | null | undefined;
    return startedAt
      ? [{ startedAt: startedAt.toMillis(), hostUid: doc.get("hostUid") as string }]
      : [];
  });
}

async function fetchHosts(games: { hostUid: string }[]): Promise<Host[]> {
  const gamesByHost = new Map<string, number>();
  games.forEach(({ hostUid }) => gamesByHost.set(hostUid, (gamesByHost.get(hostUid) ?? 0) + 1));

  const snap = await getFirestore(adminApp()).collection("hostProfiles").get();
  return snap.docs
    .map((doc) => ({
      createdAt: doc.createTime.toMillis(),
      host: {
        name: doc.get("name") as string,
        phone: doc.get("phone") as string,
        playerCode: doc.get("playerCode") as string,
        joinedDay: dayKey(doc.createTime.toMillis()),
        games: gamesByHost.get(doc.id) ?? 0,
      },
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ host }) => host);
}

export async function fetchUserAnalytics(): Promise<UserAnalytics> {
  const [accountsCreated, games] = await Promise.all([fetchAccountsCreated(), fetchGames()]);
  const hosts = await fetchHosts(games);
  const usage = summarizeUsage(
    accountsCreated,
    games.map((game) => game.startedAt),
    Date.now(),
  );
  return { ...usage, hosts };
}
