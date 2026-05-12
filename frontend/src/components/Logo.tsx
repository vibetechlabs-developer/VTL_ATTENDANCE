import { cn } from "@/lib/utils";

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center transition-all duration-300",
        !collapsed && "rounded-xl px-3 py-1.5 bg-white/80 backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.05)] border border-black/5 dark:bg-white/5 dark:border-white/10 dark:shadow-[0_2px_15px_rgba(0,0,0,0.2)]",
        collapsed && "rounded-lg p-1 hover:bg-black/5 dark:hover:bg-white/10",
        className
      )}
    >
      <img
        src="/download%20(2).png"
        alt="Vibe Tech Labs"
        className={cn(
          "select-none object-contain transition-all duration-300",
          // The 'dark:invert' and 'dark:brightness-200' will make dark text white in dark mode
          "dark:invert dark:brightness-200 dark:contrast-100",
          collapsed ? "h-8 w-8" : "h-9 w-auto min-w-[140px]"
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
