import Link from "next/link";
import { APP_NAME } from "@/lib/branding";
import { LogoMark } from "@/components/site/logo-mark";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-slate-200">
      <div className="shell-section flex flex-col gap-6 py-8 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <LogoMark className="size-8 rounded-xl" />
          <div>
            <p className="font-semibold text-slate-900">{APP_NAME}</p>
            <p className="text-xs text-slate-500">
              Browser-native CPU and GPU benchmark platform.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <Link href="/benchmark/cpu" className="transition-colors hover:text-slate-950">
            CPU
          </Link>
          <Link href="/benchmark/gpu" className="transition-colors hover:text-slate-950">
            GPU
          </Link>
          <Link href="/auth" className="transition-colors hover:text-slate-950">
            Sign in
          </Link>
          <Link href="/#about" className="transition-colors hover:text-slate-950">
            Docs
          </Link>
          <Link href="/leaderboard" className="transition-colors hover:text-slate-950">
            Leaderboard
          </Link>
          <span>© 2026 {APP_NAME}</span>
        </div>
      </div>
    </footer>
  );
}
