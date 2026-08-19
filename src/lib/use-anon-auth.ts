"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth } from "@/lib/firebase";

export function useAnonAuth() {
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          setUid(user.uid);
        } else {
          signInAnonymously(auth).catch((err) => setError(String(err)));
        }
      },
      (err) => setError(String(err)),
    );
    return unsub;
  }, []);

  return { uid, ready: uid !== null, error };
}
