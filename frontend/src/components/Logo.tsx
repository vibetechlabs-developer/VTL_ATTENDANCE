import { cn } from "@/lib/utils";

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        !collapsed && "w-full gap-2 rounded-lg px-2 py-1",
        className
      )}
    >
      <div className={cn("shrink-0 overflow-hidden rounded-xl", collapsed ? "h-9 w-9" : "h-10 w-10")}>
        <img
          src="/vtl-white.jpeg"
          alt="Vibe Tech Labs logo"
          className="h-full w-full object-cover dark:hidden"
          onError={(e) => {
            e.currentTarget.src = "/download%20(2).png";
          }}
          draggable={false}
        />
        <img
          src="/vtl-dark.jpeg"
          alt="Vibe Tech Labs logo"
          className="hidden h-full w-full object-cover dark:block"
          onError={(e) => {
            e.currentTarget.src = "/download%20(2).png";
          }}
          draggable={false}
        />
      </div>
      {!collapsed && (
        <div className="min-w-0 text-left leading-tight">
          <p className="truncate text-[13px] font-semibold tracking-tight text-foreground">Vibe Tech Labs</p>
          <p className="truncate text-[10px] text-muted-foreground">A Digital Idea To Grow You Up</p>
        </div>
      )}
    </div>
  );
}
