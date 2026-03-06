import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-4xl flex-col items-start justify-center gap-6 px-6 py-16 sm:px-8 lg:px-12">
      <p className="eyebrow">Missing route</p>
      <h1 className="text-5xl font-semibold tracking-[-0.06em] text-slate-950">
        That Can I Run This page does not exist.
      </h1>
      <p className="max-w-2xl text-base leading-8 text-slate-600">
        The benchmark result may have expired from local dev storage, or the
        URL might be wrong.
      </p>
      <Button asChild className="rounded-full bg-primary text-primary-foreground">
        <Link href="/">Back to benchmarks</Link>
      </Button>
    </div>
  );
}
