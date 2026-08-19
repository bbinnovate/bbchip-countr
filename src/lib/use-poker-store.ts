"use client";

import { useEffect, useState } from "react";
import { useAnonAuth } from "@/lib/use-anon-auth";
import { usePlayerCode } from "@/lib/use-player-code";
import { subscribeActiveSession, subscribeCodeHistory, type Session } from "@/lib/poker";

export function usePokerStore() {
  const { uid } = useAnonAuth();
  const { code } = usePlayerCode();
  const [active, setActive] = useState<Session | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const [activeReady, setActiveReady] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeActiveSession(uid, (s) => {
      setActive(s);
      setActiveReady(true);
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!code) return;
    const unsub = subscribeCodeHistory(code, (list) => {
      setHistory(list);
      setHistoryReady(true);
    });
    return unsub;
  }, [code]);

  return { active, history, ready: activeReady && historyReady };
}
