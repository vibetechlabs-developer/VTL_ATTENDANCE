import { cn } from "@/lib/utils";

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center",
        !collapsed && "dark:bg-white/90 dark:rounded-lg dark:px-2 dark:py-1",
        className
      )}
    >
      <img
        src="/vtl-logo-transparent.png"
        alt="Vibe Tech Labs"
        className={cn(
          "select-none object-contain",
          collapsed ? "h-10 w-10" : "h-12 w-[188px]"
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
  );
}
