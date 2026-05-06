import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Calendar as CalendarIcon, Pencil, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusPill } from "@/components/StatusPill";
import { formatDistanceToNow } from "date-fns";
import { useAuthStore } from "@/store/authStore";
import { updatesPostRequest, updatesRequest } from "@/lib/api";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function DailyUpdatesFeed() {
  // Use local date string (avoid UTC shifting issues).
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState<string>(today);
  const dateRef = useRef<HTMLInputElement | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [updates, setUpdates] = useState<any[]>([]);
  const [text, setText] = useState("");

  const run = async () => {
    if (!accessToken) return;
    const res = await updatesRequest(accessToken, { all: true, date });
    if (!res.ok) return;
    const body = (await res.json()) as any[];
    setUpdates(body);
  };

  useEffect(() => {
    void run();
  }, [accessToken, date]);

  const handlePost = async () => {
    if (!accessToken || !text.trim()) return;
    const res = await updatesPostRequest(accessToken, text.trim());
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      toast.error(body.error || "Could not post update");
      return;
    }
    setText("");
    toast.success(body.message || "Update posted");
    await run();
  };

  const filtered = updates;

  return (
    <div className="space-y-6 w-full max-w-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Daily Updates</h1>
          <p className="text-muted-foreground mt-1">Share your progress and see what the team accomplished.</p>
        </div>

        <div className="relative shrink-0 w-full sm:w-auto">
          <input
            ref={dateRef}
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              const next = e.target.value;
              setDate(next > today ? today : next);
            }}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => {
              const el = dateRef.current;
              if (!el) return;
              // Chrome supports showPicker(); fallback to click().
              // @ts-expect-error showPicker isn't in TS lib yet
              if (typeof el.showPicker === "function") el.showPicker();
              else el.click();
            }}
            className="w-full sm:w-auto flex items-center justify-between gap-2 px-4 py-2 bg-card border border-border/50 rounded-xl shadow-sm hover:bg-muted/50 transition-smooth"
          >
            <span className="font-medium">{format(parseISO(date), "dd-MM-yyyy")}</span>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-gradient-primary text-primary-foreground text-sm font-semibold">
              {user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "AD"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-3">
            <Textarea
              placeholder="Share an update with the team..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[90px] resize-none"
            />
            <div className="flex justify-end">
              <Button onClick={handlePost} disabled={!text.trim()} className="bg-gradient-primary">
                <Send className="h-4 w-4 mr-2" /> Post update
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
            <Pencil className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <p className="text-muted-foreground">No updates posted on this date yet.</p>
        </div>
      ) : (
        <div className="w-full space-y-3">
          {filtered.map((u, i) => (
            <Card key={u.id} className="p-4 hover:shadow-md transition-smooth animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-gradient-primary text-primary-foreground text-sm font-semibold">
                    {String(u.employee_name || "NA").split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sm">{u.employee_name}</p>
                    <StatusPill label={u.role} variant="muted" />
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm mt-2 leading-relaxed">{u.update_text}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
