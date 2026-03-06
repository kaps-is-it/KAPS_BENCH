import { GaugeCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-11 items-center justify-center rounded-2xl bg-primary text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)]",
        className,
      )}
    >
      <GaugeCircle className="size-5" strokeWidth={2.3} />
    </div>
  );
}
