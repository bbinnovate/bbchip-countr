"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ExternalLink,
  LayoutDashboard,
  Layers,
  LogOut,
  PlusCircle,
  Shield,
  Spade,
  User,
} from "lucide-react";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";

interface CurrentAdmin {
  id: string;
  email: string;
  name: string;
  role: string;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<CurrentAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      return;
    }

    // Verify session
    fetch("/api/admin/auth/me")
      .then((res) => {
        if (!res.ok) {
          router.replace("/admin/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setAdmin(data.user);
        }
        setLoading(false);
      })
      .catch(() => {
        router.replace("/admin/login");
      });
  }, [pathname, isLoginPage, router]);

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } finally {
      router.push("/admin/login");
    }
  };

  if (isLoginPage) {
    return (
      <>
        {children}
        <Toaster theme="dark" richColors position="top-right" />
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs font-bold tracking-widest uppercase">
            Loading Admin Workspace...
          </span>
        </div>
      </div>
    );
  }

  const navLinks = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/ads", label: "Ads Manager", icon: Layers },
    { href: "/admin/ads/new", label: "New Ad", icon: PlusCircle },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Admin Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo & Portal Title */}
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2.5">
              <span className="btn-gold flex h-8 w-8 items-center justify-center rounded-lg shadow-sm">
                <Spade className="h-4 w-4" />
              </span>
              <div>
                <span className="font-display text-base font-extrabold tracking-tight">
                  THE <span className="gold-text">LEDGER</span>
                </span>
                <span className="ml-2 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-primary uppercase">
                  ADS
                </span>
              </div>
            </Link>

            {/* Desktop Nav Links */}
            <nav className="hidden items-center gap-1 sm:flex">
              {navLinks.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition",
                      isActive
                        ? "bg-secondary text-primary"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User profile & actions */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              target="_blank"
              className="hidden items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:text-foreground sm:inline-flex"
              title="Open public app in new tab"
            >
              <span>View Site</span>
              <ExternalLink className="h-3 w-3" />
            </Link>

            {admin && (
              <div className="hidden items-center gap-2 rounded-lg border border-border bg-secondary/30 px-2.5 py-1 text-right sm:flex">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">
                  <User className="h-3 w-3" />
                </div>
                <div className="leading-tight">
                  <p className="text-[11px] font-bold text-foreground">{admin.name}</p>
                  <p className="text-[9px] text-muted-foreground uppercase">{admin.role}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs font-bold text-destructive transition hover:bg-destructive/20"
              title="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="flex border-t border-border/60 px-4 py-2 sm:hidden">
          <nav className="flex w-full items-center justify-around">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex flex-col items-center gap-1 py-1 text-[10px] font-bold",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>

      <Toaster theme="dark" richColors position="top-right" />
    </div>
  );
}
