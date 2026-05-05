import { cn } from "@/lib/utils";

type Variant = "success" | "warning" | "destructive" | "info" | "muted";

const variantStyles: Record<Variant, string> = {
  success: "bg-success/10 text-success border border-success/20",
  warning: "bg-warning/10 text-warning border border-warning/20",
  destructive: "bg-destructive/10 text-destructive border border-destructive/20",
  info: "bg-info/10 text-info border border-info/20",
  muted: "bg-muted text-muted-foreground border border-border",
};

export function StatusPill({ label, variant = "muted", className }: { label: string; variant?: Variant; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", variantStyles[variant], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", {
        "bg-success": variant === "success",
        "bg-warning": variant === "warning",
        "bg-destructive": variant === "destructive",
        "bg-info": variant === "info",
        "bg-muted-foreground": variant === "muted",
      })} />
      {label}
    </span>
  );
}
