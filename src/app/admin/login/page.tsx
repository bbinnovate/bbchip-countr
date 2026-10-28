"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Lock, Mail, ShieldCheck, Spade } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);

  // Check if admin is already logged in
  useEffect(() => {
    fetch("/api/admin/auth/me")
      .then((res) => {
        if (res.ok) {
          router.replace("/admin");
        } else {
          setCheckingExisting(false);
        }
      })
      .catch(() => setCheckingExisting(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please provide both email and password");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      router.push("/admin");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
      setLoading(false);
    }
  };

  if (checkingExisting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm font-medium">Verifying session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-8 text-center">
          <div className="btn-gold mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg">
            <Spade className="h-8 w-8" />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            THE <span className="gold-text">LEDGER</span>
          </h1>
          <p className="mt-1 text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">
            Ads Management Portal
          </p>
        </div>

        {/* Card Form */}
        <div className="surface metallic p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-2 border-b border-border pb-4">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-bold tracking-wider text-foreground uppercase">
              Admin Authentication
            </h2>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-xs font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@theledger.com"
                  className="w-full rounded-lg border border-border bg-secondary py-2.5 pr-4 pl-10 text-sm text-foreground transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg border border-border bg-secondary py-2.5 pr-4 pl-10 text-sm text-foreground transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-gold mt-6 flex w-full items-center justify-center gap-2 py-3 text-xs font-extrabold tracking-wider disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  <span>AUTHENTICATING...</span>
                </>
              ) : (
                <span>SIGN IN TO DASHBOARD</span>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-border/70 pt-4 text-center">
            <p className="text-[11px] text-muted-foreground">
              Internal admin area. Registration is restricted to system administrators via API.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
