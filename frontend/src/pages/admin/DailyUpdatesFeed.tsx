import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Calendar as CalendarIcon, Pencil, Send, Users, LayoutList, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusPill } from "@/components/StatusPill";
import { Badge } from "@/components/ui/badge";
import { safeFormatDistanceToNow } from "@/utils/safeDate";
import { useAuthStore } from "@/store/authStore";
import { updatesDeleteRequest, updatesPostRequest, updatesRequest, usersListRequest } from "@/lib/api";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function DailyUpdatesFeed() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState<string>(today);
  const [showAllDates, setShowAllDates] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [employees, setEmployees] = useState<any[]>([]);
  const dateRef = useRef<HTMLInputElement | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isAdmin = ["admin", "manager", "hr"].includes(user?.role ?? "");
  const [updates, setUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
const [bdeReportData, setBdeReportData] = useState<Record<string, any>>({
  blog_posts: "",
  ppt_posts: "",
  business_listings: "",
  classified_ads: "",
  total_calls: "",
  calls_received: "",
  meetings: "",
  clients_done: "",
  data_extracted_india: "",
  data_extracted_abroad: "",
  mail_sent_bde: "",
  mail_sent_general: "",
  linkedin_post: false,
  linkedin_connections: "",
  linkedin_messages: "",
  linkedin_data_extracted: "",
  newspaper_read: false,
  newspaper_important_news: "",
  group_photos_added: false,
});

  // Load employees for filter dropdown (admin only)
  useEffect(() => {
    if (!accessToken || !isAdmin) return;
    usersListRequest(accessToken)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setEmployees(Array.isArray(data) ? data : []));
  }, [accessToken, isAdmin]);

  const run = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    const params: { all?: boolean; date?: string; employee_id?: string } = {};
    if (isAdmin) params.all = true;
    if (!showAllDates) params.date = date;
    if (isAdmin && employeeFilter !== "all") params.employee_id = employeeFilter;
    const res = await updatesRequest(accessToken, params);
    setLoading(false);
    if (!res.ok) return;
    const body = (await res.json()) as any[];
    setUpdates(body);
  }, [accessToken, date, showAllDates, employeeFilter, isAdmin]);

  useEffect(() => {
    void run();
  }, [run]);

  const [postDate, setPostDate] = useState<string>(today);

  const handlePost = async () => {
    if (!accessToken || !text.trim()) return;
    if (postDate > today) {
      toast.error("Selected date cannot be in the future.");
      return;
    }
    // BDE validation
    if (user?.role === "sales") {
      const missing = Object.entries(bdeReportData).filter(([key, value]) => {
        if (typeof value === "boolean") return false; // booleans are optional boolean defaults
        return !String(value).trim();
      });
      if (missing.length) {
        toast.error("Please fill all report fields before posting.");
        return;
      }
    }
    const res = await updatesPostRequest(
      accessToken,
      text.trim(),
      user?.role === "sales" ? bdeReportData : undefined,
      postDate !== today ? postDate : undefined
    );
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      toast.error(body.error || "Could not post update");
      return;
    }
    setText("");
    setPostDate(today);
    // Reset BDE fields after successful post
    if (user?.role === "sales") setBdeReportData({
      blog_posts: "",
      ppt_posts: "",
      business_listings: "",
      classified_ads: "",
      total_calls: "",
      calls_received: "",
      meetings: "",
      clients_done: "",
      data_extracted_india: "",
      data_extracted_abroad: "",
      mail_sent_bde: "",
      mail_sent_general: "",
      linkedin_post: false,
      linkedin_connections: "",
      linkedin_messages: "",
      linkedin_data_extracted: "",
      newspaper_read: false,
      newspaper_important_news: "",
      group_photos_added: false,
    });
    toast.success(body.message || "Update posted");
    await run();
  };

  const handleDelete = async (updateId: number | string) => {
    if (!accessToken) return;
    if (!confirm("Are you sure you want to delete this update?")) return;
    const res = await updatesDeleteRequest(accessToken, updateId);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error || "Could not delete update");
      return;
    }
    toast.success("Update deleted");
    await run();
  };

  // Group updates by date when showing all dates
  const groupedByDate = useMemo(() => {
    if (!showAllDates) return null;
    const map: Record<string, any[]> = {};
    for (const u of updates) {
      const d = u.date || u.created_at?.slice(0, 10) || "Unknown";
      if (!map[d]) map[d] = [];
      map[d].push(u);
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [updates, showAllDates]);

  const splitUrls = (value: unknown): string[] => {
    if (typeof value !== "string") return [];
    return value.split(/[\n,]/).map((p) => p.trim()).filter(Boolean);
  };

  const reportLine = (label: string, value: any) => (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-medium text-right whitespace-pre-wrap break-words max-w-[70%]">
        {String(value ?? "—")}
      </span>
    </div>
  );

  const UpdateCard = ({ u, i }: { u: any; i: number }) => (
    <Card key={u.id} className="p-4 hover:shadow-md transition-smooth animate-fade-in" style={{ animationDelay: `${i * 30}ms` }}>
      <div className="flex gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-gradient-primary text-primary-foreground text-sm font-semibold">
            {String(u.employee_name || "NA").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-sm">{u.employee_name}</p>
            <StatusPill label={u.role} variant="muted" />
            {u.date && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">
                {u.date}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {safeFormatDistanceToNow(u.created_at, { addSuffix: true })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive transition-colors shrink-0"
              title="Delete update"
              onClick={() => handleDelete(u.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm mt-2 leading-relaxed">{u.update_text}</p>

          {u?.report_data && u?.role === "sales" && (
            <div className="mt-3 rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold">Sales/BDE report</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/60 bg-background/40 p-2 space-y-1.5">
                  <p className="text-[11px] font-semibold">Work counts</p>
                  {reportLine("Blog posts", u.report_data.blog_posts)}
                  {reportLine("PPT posts", u.report_data.ppt_posts)}
                  {reportLine("Business listings", u.report_data.business_listings)}
                  {reportLine("Classified ads", u.report_data.classified_ads)}
                  {reportLine("Calls (total/received)", `${u.report_data.total_calls ?? "—"} / ${u.report_data.calls_received ?? "—"}`)}
                  {reportLine("Meetings", u.report_data.meetings)}
                  {reportLine("Clients done", u.report_data.clients_done)}
                  {reportLine("Data extracted (India/Abroad)", `${u.report_data.data_extracted_india ?? "—"} / ${u.report_data.data_extracted_abroad ?? "—"}`)}
                  {reportLine("Mails (B2B/General)", `${u.report_data.mail_sent_b2b ?? "—"} / ${u.report_data.mail_sent_general ?? "—"}`)}
                </div>
                <div className="rounded-lg border border-border/60 bg-background/40 p-2 space-y-1.5">
                  <p className="text-[11px] font-semibold">LinkedIn + Newspaper</p>
                  {reportLine("LinkedIn post", u.report_data.linkedin_post === true ? "YES" : u.report_data.linkedin_post === false ? "NO" : "—")}
                  {reportLine("LinkedIn connections", u.report_data.linkedin_connections)}
                  {reportLine("LinkedIn messages", u.report_data.linkedin_messages)}
                  {reportLine("LinkedIn data extracted", u.report_data.linkedin_data_extracted)}
                  {reportLine("Newspaper read", u.report_data.newspaper_read === true ? "YES" : u.report_data.newspaper_read === false ? "NO" : "—")}
                  {reportLine("Important news", u.report_data.newspaper_important_news)}
                  {reportLine("Photos added in group", u.report_data.group_photos_added === true ? "YES" : u.report_data.group_photos_added === false ? "NO" : "—")}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-2 space-y-1.5">
                <p className="text-[11px] font-semibold">Links</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {["blog_links", "ppt_links", "business_links", "classified_links"].map((key) => (
                    <div key={key} className="space-y-1">
                      <p className="text-[11px] text-muted-foreground capitalize">{key.replace("_links", "")} links ({splitUrls(u.report_data[key]).length})</p>
                      <div className="space-y-1">
                        {splitUrls(u.report_data[key]).slice(0, 5).map((l: string) => (
                          <a key={l} href={l} target="_blank" rel="noreferrer" className="text-[11px] text-primary underline break-all block">{l}</a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Showing first 5 links in each section.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Daily Updates</h1>
          <p className="text-muted-foreground mt-1">Share your progress and see what the team accomplished.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Employee filter (admin only) */}
          {isAdmin && (
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="w-[160px] h-9 rounded-xl text-sm">
                <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="All employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees.map((emp: any) => (
                  <SelectItem key={emp.id || emp.employee_id} value={String(emp.id || emp.employee_id)}>
                    {emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Show All / Date toggle */}
          {isAdmin && (
            <Button
              variant={showAllDates ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAllDates((v) => !v)}
              className="rounded-xl gap-1.5 h-9"
            >
              <LayoutList className="h-3.5 w-3.5" />
              {showAllDates ? "All dates" : "By date"}
            </Button>
          )}

          {/* Date Picker (hidden when all dates selected) */}
          {!showAllDates && (
            <div className="relative">
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
                  // @ts-expect-error showPicker isn't in TS lib yet
                  if (typeof el.showPicker === "function") el.showPicker();
                  else el.click();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-card border border-border/50 rounded-xl shadow-sm hover:bg-muted/50 transition-smooth text-sm h-9"
              >
                <span className="font-medium">{format(parseISO(date), "dd-MM-yyyy")}</span>
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Post update composer */}
      <Card className="p-4">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-gradient-primary text-primary-foreground text-sm font-semibold">
              {user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "AD"}
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
{user?.role === "sales" && (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
    <Input placeholder="Blog posts" value={bdeReportData.blog_posts} onChange={e => setBdeReportData({ ...bdeReportData, blog_posts: e.target.value })} />
    <Input placeholder="PPT posts" value={bdeReportData.ppt_posts} onChange={e => setBdeReportData({ ...bdeReportData, ppt_posts: e.target.value })} />
    <Input placeholder="Business listings" value={bdeReportData.business_listings} onChange={e => setBdeReportData({ ...bdeReportData, business_listings: e.target.value })} />
    <Input placeholder="Classified ads" value={bdeReportData.classified_ads} onChange={e => setBdeReportData({ ...bdeReportData, classified_ads: e.target.value })} />
    <Input placeholder="Total calls" value={bdeReportData.total_calls} onChange={e => setBdeReportData({ ...bdeReportData, total_calls: e.target.value })} />
    <Input placeholder="Calls received" value={bdeReportData.calls_received} onChange={e => setBdeReportData({ ...bdeReportData, calls_received: e.target.value })} />
    <Input placeholder="Meetings" value={bdeReportData.meetings} onChange={e => setBdeReportData({ ...bdeReportData, meetings: e.target.value })} />
    <Input placeholder="Clients done" value={bdeReportData.clients_done} onChange={e => setBdeReportData({ ...bdeReportData, clients_done: e.target.value })} />
    <Input placeholder="Data extracted (India)" value={bdeReportData.data_extracted_india} onChange={e => setBdeReportData({ ...bdeReportData, data_extracted_india: e.target.value })} />
    <Input placeholder="Data extracted (Abroad)" value={bdeReportData.data_extracted_abroad} onChange={e => setBdeReportData({ ...bdeReportData, data_extracted_abroad: e.target.value })} />
    <Input placeholder="Mail sent (BDE)" value={bdeReportData.mail_sent_bde} onChange={e => setBdeReportData({ ...bdeReportData, mail_sent_bde: e.target.value })} />
    <Input placeholder="Mail sent (General)" value={bdeReportData.mail_sent_general} onChange={e => setBdeReportData({ ...bdeReportData, mail_sent_general: e.target.value })} />
    <label className="flex items-center space-x-2">
      <input type="checkbox" checked={bdeReportData.linkedin_post} onChange={e => setBdeReportData({ ...bdeReportData, linkedin_post: e.target.checked })} className="h-4 w-4" />
      <span>LinkedIn post</span>
    </label>
    <Input placeholder="LinkedIn connections" value={bdeReportData.linkedin_connections} onChange={e => setBdeReportData({ ...bdeReportData, linkedin_connections: e.target.value })} />
    <Input placeholder="LinkedIn messages" value={bdeReportData.linkedin_messages} onChange={e => setBdeReportData({ ...bdeReportData, linkedin_messages: e.target.value })} />
    <Input placeholder="LinkedIn data extracted" value={bdeReportData.linkedin_data_extracted} onChange={e => setBdeReportData({ ...bdeReportData, linkedin_data_extracted: e.target.value })} />
    <label className="flex items-center space-x-2">
      <input type="checkbox" checked={bdeReportData.newspaper_read} onChange={e => setBdeReportData({ ...bdeReportData, newspaper_read: e.target.checked })} className="h-4 w-4" />
      <span>Newspaper read</span>
    </label>
    <Input placeholder="Important news" value={bdeReportData.newspaper_important_news} onChange={e => setBdeReportData({ ...bdeReportData, newspaper_important_news: e.target.value })} />
    <label className="flex items-center space-x-2">
      <input type="checkbox" checked={bdeReportData.group_photos_added} onChange={e => setBdeReportData({ ...bdeReportData, group_photos_added: e.target.checked })} className="h-4 w-4" />
      <span>Group photos added</span>
    </label>
  </div>
)}
        </div>
      </Card>

      {/* Summary bar */}
      {updates.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LayoutList className="h-4 w-4" />
          <span>
            {updates.length} update{updates.length !== 1 ? "s" : ""}
            {showAllDates ? " across all dates" : ` on ${format(parseISO(date), "dd MMM yyyy")}`}
            {employeeFilter !== "all" && ` · ${employees.find((e) => String(e.id) === employeeFilter)?.name ?? "Employee"}`}
          </span>
        </div>
      )}

      {/* Updates list */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground">Loading updates…</div>
      ) : updates.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
            <Pencil className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <p className="text-muted-foreground">No updates posted{showAllDates ? "" : " on this date"} yet.</p>
        </div>
      ) : showAllDates && groupedByDate ? (
        // Grouped by date view
        <div className="space-y-6">
          {groupedByDate.map(([d, dateUpdates]) => (
            <div key={d} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border/50" />
                <Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-semibold">
                  {d !== "Unknown" ? format(parseISO(d), "EEEE, dd MMM yyyy") : d}
                  <span className="ml-2 text-muted-foreground">({dateUpdates.length})</span>
                </Badge>
                <div className="h-px flex-1 bg-border/50" />
              </div>
              <div className="space-y-3">
                {dateUpdates.map((u, i) => <UpdateCard key={u.id} u={u} i={i} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Single date view
        <div className="space-y-3">
          {updates.map((u, i) => <UpdateCard key={u.id} u={u} i={i} />)}
        </div>
      )}
    </div>
  );
}
