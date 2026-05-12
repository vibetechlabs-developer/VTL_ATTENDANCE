import { cn } from "@/lib/utils";

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        !collapsed && "w-full rounded-lg px-2 py-1",
        className
      )}
    >
      <img
        src="/download%20(2).png"
        alt="Vibe Tech Labs"
        className={cn(
          "select-none object-contain max-w-full",
          collapsed ? "h-9 w-9" : "h-10 w-[170px]"
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
