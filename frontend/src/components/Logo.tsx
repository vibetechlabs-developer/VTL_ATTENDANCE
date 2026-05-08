import { cn } from "@/lib/utils";

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl shadow-3d bg-background/20 border border-border/40",
          collapsed ? "h-10 w-10" : "h-10 w-[170px]"
        )}
      >
        <img
          src="/vtl-logo.svg"
          alt="Vibe Tech Labs"
          className={cn(
            "h-full w-full",
            collapsed ? "object-cover object-left-center" : "object-contain"
          )}
          draggable={false}
        />
      </div>
    </div>
  );
}
