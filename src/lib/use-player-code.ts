"use client";

import { useEffect, useState } from "react";
import { ensurePlayerCode, savePlayerCode } from "@/lib/player-code";

export function usePlayerCode() {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setCode(ensurePlayerCode());
    sync();
    window.addEventListener("player-code", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("player-code", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const importCode = (next: string) => {
    savePlayerCode(next);
    setCode(next);
  };

  return { code, importCode };
}
