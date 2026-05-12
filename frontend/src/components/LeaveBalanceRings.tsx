import { cn } from "@/lib/utils";

export type LeaveBalanceShape = {
  casual_remaining?: number;
  casual_total?: number;
  sick_remaining?: number;
  sick_total?: number;
  earned_remaining?: number;
  earned_total?: number;
};

function Ring({
  label,
  remaining,
  total,
  accentClass,
}: {
  label: string;
  remaining: number;
  total: number;
  accentClass: string;
}) {
  const t = Math.max(1, total || 1);
  const pct = Math.min(100, Math.max(0, (remaining / t) * 100));
  const dash = 2 * Math.PI * 36;
  const offset = dash - (pct / 100) * dash;

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[72px]">
      <div className="relative h-[76px] w-[76px]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80" aria-hidden>
          <circle cx="40" cy="40" r="36" fill="none" className="stroke-muted/50" strokeWidth="6" />
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            className={cn("transition-[stroke-dashoffset] duration-700 ease-out", accentClass)}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={dash}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold tabular-nums leading-none">{remaining}</span>
          <span className="text-[9px] text-muted-foreground tabular-nums">/ {t}</span>
        </div>
      </div>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

export function LeaveBalanceRings({ balance, className }: { balance: LeaveBalanceShape | null; className?: string }) {
  if (!balance) {
    return (
      <div className={cn("flex gap-6 justify-center py-2", className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-[76px] w-[76px] rounded-full bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  const casualR = Number(balance.casual_remaining ?? 0);
  const casualT = Number(balance.casual_total ?? 1);
  const sickR = Number(balance.sick_remaining ?? 0);
  const sickT = Number(balance.sick_total ?? 1);
  const earnedR = Number(balance.earned_remaining ?? 0);
  const earnedT = Number(balance.earned_total ?? 1);

  return (
    <div className={cn("flex flex-wrap items-end justify-center gap-6 sm:gap-8", className)}>
      <Ring label="Casual" remaining={casualR} total={casualT} accentClass="stroke-primary" />
      <Ring label="Sick" remaining={sickR} total={sickT} accentClass="stroke-[hsl(var(--warning))]" />
      <Ring label="Paid" remaining={earnedR} total={earnedT} accentClass="stroke-[hsl(var(--info))]" />
    </div>
  );
}
