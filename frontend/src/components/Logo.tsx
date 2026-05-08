import { cn } from "@/lib/utils";

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border shadow-3d",
          "bg-gradient-to-br from-emerald-950/85 via-slate-950/85 to-slate-900/90",
          "border-emerald-400/30 ring-1 ring-emerald-300/15",
          collapsed ? "h-11 w-11 p-1" : "h-12 w-[188px] p-1.5"
        )}
      >
        <img
          src="/vtl-logo.svg"
          alt="Vibe Tech Labs"
          className={cn(
            "h-full w-full rounded-md select-none mix-blend-multiply",
            collapsed ? "object-cover object-left" : "object-contain"
          )}
          draggable={false}
        />
      </div>
    </div>
  );
}
