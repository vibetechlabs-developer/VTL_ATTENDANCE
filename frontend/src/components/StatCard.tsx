import { cn } from "@/lib/utils";
import { AnimatedCounter } from "./AnimatedCounter";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  trend?: number;
  accent?: "primary" | "success" | "warning" | "info";
  suffix?: string;
  onClick?: () => void;
}

const accentMap = {
  primary: { bg: "icon-3d-sage", text: "text-primary-foreground", stripe: "stat-stripe-primary" },
  success: { bg: "icon-3d-sage", text: "text-primary-foreground", stripe: "stat-stripe-success" },
  warning: { bg: "icon-3d-peach", text: "text-foreground/80", stripe: "stat-stripe-warning" },
  info: { bg: "icon-3d-powder", text: "text-foreground/80", stripe: "stat-stripe-info" },
};

export function StatCard({ label, value, icon: Icon, trend, accent = "primary", suffix, onClick }: StatCardProps) {
  const up = (trend ?? 0) >= 0;
  const a = accentMap[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className={cn(
        "soft-3d p-5 transition-smooth border-glow-shine",
        onClick && "cursor-pointer hover:shadow-glass hover:ring-1 hover:ring-primary/50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
          <p className="text-[28px] font-bold tracking-tight leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>
            <AnimatedCounter value={value} suffix={suffix} />
          </p>
        </div>
        <div className={cn("h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center", a.bg)}>
          <Icon className={cn("h-5 w-5", a.text)} />
        </div>
      </div>
      {typeof trend === "number" && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <span className={cn("flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md",
            up ? "text-success bg-success/10" : "text-destructive bg-destructive/10")}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend)}%
          </span>
          <span className="text-muted-foreground">vs last week</span>
        </div>
      )}
    </motion.div>
  );
}
