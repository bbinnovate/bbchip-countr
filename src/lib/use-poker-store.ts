import { useEffect, useState } from "react";
import { loadActive, loadHistory, type Session } from "./poker";

export function usePokerStore() {
  const [active, setActive] = useState<Session | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setActive(loadActive());
      setHistory(loadHistory());
      setReady(true);
    };
    sync();
    window.addEventListener("poker-store", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("poker-store", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { active, history, ready };
}
