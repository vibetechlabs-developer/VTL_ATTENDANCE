import { cn } from "@/lib/utils";

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center", className)}>
      <img
        src="/download%20(2).png"
        alt="Vibe Tech Labs"
        className={cn(
          "select-none object-contain dark:opacity-95",
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
