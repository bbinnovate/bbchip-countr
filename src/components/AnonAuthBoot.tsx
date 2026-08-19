"use client";

import { useAnonAuth } from "@/lib/use-anon-auth";

/** Ensures anonymous sign-in kicks off on first load, regardless of which
 * route a visitor lands on (e.g. a guest opening a shared session link
 * directly) — without this, routes that don't otherwise call
 * useAnonAuth() would never authenticate and every Firestore read
 * would be denied. */
export function AnonAuthBoot() {
  useAnonAuth();
  return null;
}
