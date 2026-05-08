import { cn } from "@/lib/utils";

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border shadow-glass backdrop-blur-xl",
          "bg-sidebar/30 border-border/45",
          "dark:bg-sidebar/20 dark:border-primary/20",
          collapsed ? "h-11 w-11 p-1" : "h-12 w-[188px] p-1.5"
        )}
      >
        <img
          src="/download%20(2).png"
          alt="Vibe Tech Labs"
          className={cn(
            "h-full w-full select-none object-contain",
            collapsed ? "object-cover object-left" : "object-contain"
          )}
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.src.endsWith("/vtl-logo-transparent.png")) {
              img.src = "/vtl-logo-transparent.png";
            }
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}
