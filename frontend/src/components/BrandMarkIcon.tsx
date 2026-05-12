import { cn } from "@/lib/utils";

/** Shared project logo asset. */
export function BrandMarkIcon({ className }: { className?: string }) {
  return (
    <div className={cn("login-logo-3d shrink-0 overflow-hidden", className)} aria-hidden>
      <img src="/vtl-transperent.png" alt="" className="relative z-10 h-full w-full object-contain" />
    </div>
  );
}
