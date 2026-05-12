import { cn } from "@/lib/utils";

/** Orange tile + centered V mark only: dark JPEG on light theme, white JPEG on dark theme. */
export function BrandMarkIcon({ className }: { className?: string }) {
  return (
    <div className={cn("login-logo-3d shrink-0 overflow-hidden", className)} aria-hidden>
      <img src="/vtl-dark.jpeg" alt="" className="relative z-10 dark:hidden" />
      <img src="/vtl-white.jpeg" alt="" className="relative z-10 hidden dark:block" />
    </div>
  );
}
