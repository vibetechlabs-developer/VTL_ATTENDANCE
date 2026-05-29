import { Bell, Search, UserCircle, Settings, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuthStore } from "@/store/authStore";
import { useAttendanceStore } from "@/store/attendanceStore";
import { useDataStore } from "@/store/dataStore";
import { shouldShowBreakDurationAlert, shouldSkipLunchReminder } from "@/utils/lunchReminders";
import { cn, userInitials } from "@/lib/utils";
import { safeGetItem, safeSetItem } from "@/utils/storageSafe";
import { canUseWebPush } from "@/utils/platform";
import { StatusPill } from "@/components/StatusPill";
import { toast } from "sonner";
import { pushPublicKeyRequest, pushSubscribeRequest, pushUnsubscribeRequest } from "@/lib/api";
import { markNotificationsReadRequest, myNotificationsRequest } from "@/lib/api";

export function AppHeader() {
  const { user, logout, accessToken } = useAuthStore();
  const attendanceStatus = useAttendanceStore((s) => s.status);
  const attendanceBreaks = useAttendanceStore((s) => s.breaks);
  const breakStartAt = useAttendanceStore((s) => s.breakStartAt);
  const { notifications, markNotificationsRead, addNotification } = useDataStore();
  const location = useLocation();
  const navigate = useNavigate();
  const reminderInitRef = useRef(false);
  const [headerSearch, setHeaderSearch] = useState("");
  const unread = (notifications ?? []).filter((n) => !n.read).length;

  useEffect(() => {
    if (!accessToken) return;
    const run = async () => {
      try {
        const res = await myNotificationsRequest(accessToken);
        if (!res.ok) return;
        const body = await res.json().catch(() => []);
        const list = Array.isArray(body) ? body : [];
        const mapped = list.map((n: any) => ({
          id: String(n.id),
          title: String(n.title || ""),
          body: String(n.body || ""),
          type: (String(n.type || "info") as "info" | "success" | "warning"),
          read: !!n.read,
          time: n.created_at ? new Date(n.created_at).toLocaleString() : "just now",
        }));
        useDataStore.setState({ notifications: mapped });
      } catch {
        /* keep in-app notifications only */
      }
    };
    void run();
  }, [accessToken]);

  useEffect(() => {
    if (!user) return;
    const localDateKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const checkSchedule = () => {
      const now = new Date();
      const todayKey = localDateKey(now); // local timezone date (not UTC)

      const lunchAt = new Date(now);
      lunchAt.setHours(13, 0, 0, 0); // 1:00 PM local time
      const lunchDoneAt = new Date(lunchAt.getTime() + 30 * 60 * 1000); // 1:30 PM

      const lunchKey = `vtl_lunch_notified_${todayKey}`;
      const followKey = `vtl_lunch_follow_notified_${todayKey}`;
      const isInitialRun = !reminderInitRef.current;

      // On first run in a new browser/profile, do not fire stale reminders immediately.
      // If scheduled time has already passed, mark them handled for today.
      if (isInitialRun && now >= lunchAt && safeGetItem(localStorage, lunchKey) !== "1") {
        safeSetItem(localStorage, lunchKey, "1");
      }
      if (isInitialRun && now >= lunchDoneAt && safeGetItem(localStorage, followKey) !== "1") {
        safeSetItem(localStorage, followKey, "1");
      }
      reminderInitRef.current = true;

      const skipLunch = shouldSkipLunchReminder(
        attendanceStatus,
        attendanceBreaks,
        breakStartAt,
        now,
      );
      if (skipLunch) {
        safeSetItem(localStorage, lunchKey, "1");
      }

      if (
        now >= lunchAt &&
        safeGetItem(localStorage, lunchKey) !== "1" &&
        !skipLunch
      ) {
        addNotification({
          title: "Lunch Break Reminder",
          body: "It's 1:00 PM. Please take your lunch break.",
          type: "info",
        });
        toast.info("It's 1:00 PM. Please take your lunch break.");
        safeSetItem(localStorage, lunchKey, "1");
      }

      const showBreakDone = shouldShowBreakDurationAlert(
        attendanceStatus,
        attendanceBreaks,
        breakStartAt,
        now,
      );

      if (now >= lunchDoneAt && safeGetItem(localStorage, followKey) !== "1" && showBreakDone) {
        addNotification({
          title: "Break Duration Alert",
          body: "You have completed a 30-minute break. You can resume work when ready.",
          type: "warning",
        });
        toast.warning("You have completed a 30-minute break. Resume when ready.");
        safeSetItem(localStorage, followKey, "1");
      }
    };

    checkSchedule();
    const t = window.setInterval(checkSchedule, 60 * 1000); // check every minute
    return () => window.clearInterval(t);
  }, [user, addNotification, attendanceStatus, attendanceBreaks, breakStartAt]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const initials = userInitials(user?.name);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  };

  const ensurePushSubscription = async (askPermission: boolean) => {
    if (!user || !accessToken) return false;
    if (!canUseWebPush()) return false;
    try {
      const keyRes = await pushPublicKeyRequest(accessToken);
      if (!keyRes.ok) return false;
      const keyBody = (await keyRes.json().catch(() => ({}))) as { publicKey?: string };
      const publicKey = keyBody.publicKey || "";
      if (!publicKey) return false;

      let permission: NotificationPermission = Notification.permission;
      if (permission !== "granted" && askPermission) {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") return false;

      const reg = await navigator.serviceWorker.register("/sw.js");
      let subscription = await reg.pushManager.getSubscription();
      // Recreate subscription on explicit bell click to avoid stale keys.
      if (subscription && askPermission) {
        try {
          await pushUnsubscribeRequest(accessToken, subscription.endpoint);
        } catch {
          // Ignore API unsubscribe failures; continue with browser unsubscribe.
        }
        await subscription.unsubscribe().catch(() => undefined);
        subscription = null;
      }
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      await pushSubscribeRequest(accessToken, subscription.toJSON());
      if (askPermission) {
        toast.success("Browser notifications are enabled.");
      }
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!canUseWebPush()) return;
    try {
      if (Notification.permission === "granted") {
        void ensurePushSubscription(false);
      }
    } catch {
      /* iOS / private mode */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accessToken]);

  const handleBellClick = async () => {
    markNotificationsRead();
    if (accessToken) {
      await markNotificationsReadRequest(accessToken).catch(() => undefined);
    }
    if (!canUseWebPush()) return;
    const ok = await ensurePushSubscription(true);
    try {
      if (!ok && Notification.permission !== "granted") {
        toast.warning("Please allow browser notifications to receive reminders.");
      }
    } catch {
      /* ignore */
    }
  };

  const runGlobalSearch = () => {
    const term = headerSearch.trim();
    if (!term) {
      toast.warning("Please enter something to search.");
      return;
    }
    const q = encodeURIComponent(term);
    const role = user?.role;
    if (role === "admin") {
      navigate(`/admin/users?q=${q}`);
      return;
    }

    const lower = term.toLowerCase();
    if (lower.includes("attendance") || lower.includes("check")) {
      navigate("/employee/attendance");
      return;
    }
    if (lower.includes("leave")) {
      navigate("/employee/leaves");
      return;
    }
    if (lower.includes("approval")) {
      navigate("/employee/approvals");
      return;
    }
    if (lower.includes("update")) {
      navigate("/employee/updates");
      return;
    }
    if (lower.includes("profile") || lower.includes("account")) {
      navigate("/profile");
      return;
    }
    if (lower.includes("dashboard") || lower.includes("home")) {
      navigate("/employee");
      return;
    }
    toast.info("Try keywords: attendance, leaves, updates, approvals, profile");
  };

  useEffect(() => {
    setHeaderSearch("");
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border/40 bg-background/50 backdrop-blur-2xl">
      {/* Animated gradient accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, #1D9E75, #25d499, #1D9E75, transparent)' }} />

      <div className="flex h-full items-center gap-2 sm:gap-4 px-3 sm:px-6">
        <SidebarTrigger className="shrink-0" />

        <form
          className="relative flex-1 max-w-xs lg:max-w-md hidden md:block"
          onSubmit={(e) => {
            e.preventDefault();
            runGlobalSearch();
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={headerSearch}
            onChange={(e) => setHeaderSearch(e.target.value)}
            placeholder="Search… (⌘K palette)"
            className="pl-9 h-10 bg-background/90 dark:bg-card/90 backdrop-blur-md border-border/70 shadow-sm focus-visible:ring-1 rounded-xl"
          />
        </form>

        <div className="flex-1 md:hidden" />

        <div className="flex items-center gap-1 sm:gap-2 ml-auto">
          <ThemeToggle />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative rounded-full" onClick={() => void handleBellClick()}>
                <Bell className="h-[18px] w-[18px]" />
                {unread > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background animate-notification-blink" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 rounded-2xl border-border/50 bg-card/90 backdrop-blur-2xl shadow-3d">
              <div className="p-4 border-b border-border/40 flex items-center justify-between">
                <div>
                  <p className="font-semibold">Notifications</p>
                  <p className="text-xs text-muted-foreground">{unread} unread</p>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-border/30">
                {notifications.map((n) => (
                  <div key={n.id} className="p-4 hover:bg-muted/30 transition-smooth cursor-pointer">
                    <div className="flex items-start gap-2 justify-between">
                      <p className="text-sm font-medium">{n.title}</p>
                      <StatusPill label={n.type} variant={n.type === "success" ? "success" : n.type === "warning" ? "warning" : "info"} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{n.body}</p>
                    <p className="text-[11px] text-muted-foreground mt-1.5">{n.time}</p>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "flex items-center gap-2.5 rounded-full pl-1 pr-2 sm:pr-3 py-1 hover:bg-muted/40 transition-smooth"
              )}>
                <Avatar className="h-8 w-8 border border-border/50">
                  <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden lg:flex flex-col items-start leading-tight">
                  <span className="text-sm font-medium">{user?.name}</span>
                  <span className="text-[11px] text-muted-foreground capitalize">{user?.role}</span>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl border-border/50 bg-card/90 backdrop-blur-2xl shadow-3d">
              <DropdownMenuLabel className="flex flex-col">
                <span>{user?.name}</span>
                <span className="text-xs text-muted-foreground font-normal">{user?.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile" className="cursor-pointer"><UserCircle className="h-4 w-4 mr-2" /> My Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
