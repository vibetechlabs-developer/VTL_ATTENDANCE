import { cn } from "@/lib/utils";

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center",
        !collapsed && "rounded-lg px-2 py-1 bg-sidebar/55 border border-border/40 dark:bg-white/5 dark:border-white/10",
        className
      )}
    >
      <img
        src="/download%20(2).png"
        alt="Vibe Tech Labs"
        className={cn(
          "select-none object-contain",
          // Normal mode: slightly enhanced contrast
          // Dark mode: make the entire logo pure white for a perfect match
          !collapsed && "brightness-95 contrast-110",
          "dark:brightness-0 dark:invert",
          collapsed ? "h-10 w-10" : "h-12 w-[188px]"
        )}
        onError={(e) => {
          const img = e.currentTarget;
          if (!img.src.endsWith("/download%20(2).png")) {
            img.src = "/download%20(2).png";
          }
        }}
        draggable={false}
      />
    </div>
  );
}
