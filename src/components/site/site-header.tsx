"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, LoaderCircle, Search, UserRound } from "lucide-react";
import { useAuthSession } from "@/components/providers/auth-provider";
import { LogoMark } from "@/components/site/logo-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/branding";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/benchmark/cpu", label: "CPU" },
  { href: "/benchmark/gpu", label: "GPU" },
  { href: "/#real-world", label: "Real-World" },
  { href: "/#compare", label: "Compare" },
  { href: "/#leaderboard", label: "Leaderboard" },
  { href: "/#about", label: "About" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { authEnabled, loading, signOut, user } = useAuthSession();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/88 backdrop-blur-md">
      <div className="shell-section flex items-center justify-between gap-4 py-4">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <LogoMark />
          <div className="min-w-0">
            <p className="truncate text-[1.35rem] font-semibold tracking-[-0.05em] text-slate-950">
              {APP_NAME}
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "relative text-sm font-medium text-slate-600 transition-colors hover:text-slate-950",
                pathname === item.href ? "text-primary" : "",
              )}
            >
              {item.label}
              {pathname === item.href ? (
                <span className="absolute inset-x-0 -bottom-3 h-0.5 rounded-full bg-primary" />
              ) : null}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 lg:flex">
            <Search className="size-4 text-slate-400" />
            <input
              aria-label="Search hardware"
              className="w-44 bg-transparent text-sm text-slate-600 outline-none placeholder:text-slate-400 xl:w-56"
              placeholder="Search hardware..."
            />
          </div>
          {loading ? (
            <Badge className="rounded-full border-slate-200 bg-white text-slate-600">
              <LoaderCircle className="size-3.5 animate-spin" />
              Session
            </Badge>
          ) : user ? (
            <>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-12 rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              >
                <Link href="/auth" aria-label={user.email ?? "Account"}>
                  <UserRound className="size-5" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="hidden rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-950 xl:inline-flex"
                onClick={() => void signOut()}
              >
                Sign out
              </Button>
            </>
          ) : authEnabled ? (
            <Button
              asChild
              size="sm"
              className="h-11 rounded-full bg-primary px-5 text-primary-foreground shadow-[0_14px_34px_rgba(37,99,235,0.25)]"
            >
              <Link href="/auth">
                Sign in
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <Badge className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
              Local mode
            </Badge>
          )}
        </div>
      </div>
    </header>
  );
}
