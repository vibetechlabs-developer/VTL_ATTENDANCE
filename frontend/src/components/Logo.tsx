import { cn } from "@/lib/utils";

export function Logo({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl overflow-hidden shadow-3d">
        <img src="/vtl-logo.svg" alt="VTL" className="h-10 w-10 object-contain" />
      </div>
      {!collapsed && (
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-[15px] tracking-tight">Vibe Tech Labs</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Workforce CRM</span>
        </div>
      )}
    </div>
  );
}
