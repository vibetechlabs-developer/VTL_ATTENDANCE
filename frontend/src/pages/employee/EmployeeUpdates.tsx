import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Send, Calendar as CalendarIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusPill } from "@/components/StatusPill";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/authStore";
import { userInitials } from "@/lib/utils";
import { toast } from "sonner";
import { safeFormatDistanceToNow } from "@/utils/safeDate";
import { updatesPostRequest, updatesRequest } from "@/lib/api";

export default function EmployeeUpdates() {
  const today = format(new Date(), "yyyy-MM-dd");
  const { user, accessToken } = useAuthStore();
  const [text, setText] = useState("");
  const [postDate, setPostDate] = useState<string>(today);
  const [updates, setUpdates] = useState<any[]>([]);

  const load = async () => {
    if (!accessToken) return;
    const res = await updatesRequest(accessToken);
    if (!res.ok) return;
    setUpdates(await res.json());
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const handlePost = async () => {
    if (!text.trim() || !user || !accessToken) return;
    if (postDate > today) {
      toast.error("Selected date cannot be in the future.");
      return;
    }
    const res = await updatesPostRequest(accessToken, text.trim(), undefined, postDate !== today ? postDate : undefined);
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      toast.error(body.error || "Could not post update");
      return;
    }
    setText("");
    setPostDate(today);
    toast.success(body.message || "Update posted");
    await load();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Daily Updates</h1>
        <p className="text-muted-foreground mt-1">Share your daily update and progress.</p>
      </div>

      <div className="max-w-3xl space-y-4">
        <Card className="p-4">
          <div className="flex gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-gradient-primary text-primary-foreground text-sm font-semibold">
                {userInitials(user?.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <CalendarIcon className="h-3.5 w-3.5" /> Select Date:
                </span>
                <input
                  type="date"
                  value={postDate}
                  max={today}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPostDate(next > today ? today : next);
                  }}
                  className="px-3 py-1 bg-card border border-border/60 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <Textarea
                placeholder="Write your daily update..."
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

        <div className="space-y-3">
          {updates.map((u, i) => (
            <Card key={u.id} className="p-4 animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
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
                    {u.date && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {u.date}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {safeFormatDistanceToNow(u.created_at, { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm mt-2 leading-relaxed">{u.update_text}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
