import { Bell, Search, UserCircle, Settings, LogOut } from "lucide-react";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { useDataStore } from "@/store/dataStore";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/StatusPill";
import { toast } from "sonner";
import { pushPublicKeyRequest, pushSubscribeRequest, pushUnsubscribeRequest } from "@/lib/api";
import { markNotificationsReadRequest, myNotificationsRequest } from "@/lib/api";

export function AppHeader() {
  const { user, logout, accessToken } = useAuthStore();
  const { notifications, markNotificationsRead, addNotification } = useDataStore();
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!accessToken) return;
    const run = async () => {
      const res = await myNotificationsRequest(accessToken);
      if (!res.ok) return;
      const body = (await res.json().catch(() => [])) as any[];
      // Store in zustand via addNotification so UI updates consistently.
      // Clear existing by marking read state only; list is primarily for latest items.
      // Note: We keep in-app scheduled reminders via addNotification too.
      // Replace local list with backend list:
      const mapped = body.map((n: any) => ({
        id: String(n.id),
        title: String(n.title || ""),
        body: String(n.body || ""),
        type: (String(n.type || "info") as "info" | "success" | "warning"),
        read: !!n.read,
        time: n.created_at ? new Date(n.created_at).toLocaleString() : "just now",
      }));
      // @ts-expect-error setState exists in zustand internals; use explicit setter instead in future refactor
      useDataStore.setState({ notifications: mapped });
    };
    void run();
  }, [accessToken]);

  useEffect(() => {
    if (!user) return;
    let dayTimer: number | null = null;
    let followTimer: number | null = null;

    const runSchedule = () => {
      const now = new Date();
      const day = now.getDay(); // 0 Sun, 6 Sat
      if (day === 0 || day === 6) return; // working days only

      const todayKey = now.toISOString().slice(0, 10);
      const lunchAt = new Date(now);
      lunchAt.setHours(13, 0, 0, 0);
      const lunchDoneAt = new Date(lunchAt.getTime() + 30 * 60 * 1000);

      const lunchKey = `vtl_lunch_notified_${todayKey}`;
      const followKey = `vtl_lunch_follow_notified_${todayKey}`;

      if (now >= lunchAt && localStorage.getItem(lunchKey) !== "1") {
        addNotification({
          title: "Lunch Break Reminder",
          body: "It's 1:00 PM. Please take your lunch break.",
          type: "info",
        });
        toast.info("It's 1:00 PM. Please take your lunch break.");
        localStorage.setItem(lunchKey, "1");
      }

      if (now >= lunchDoneAt && localStorage.getItem(followKey) !== "1") {
        addNotification({
          title: "Break Duration Alert",
          body: "You have completed a 30-minute break.",
          type: "warning",
        });
        toast.warning("You have completed a 30-minute break.");
        localStorage.setItem(followKey, "1");
      }

      if (now < lunchAt && localStorage.getItem(lunchKey) !== "1") {
        dayTimer = window.setTimeout(() => {
          addNotification({
            title: "Lunch Break Reminder",
            body: "It's 1:00 PM. Please take your lunch break.",
            type: "info",
          });
          toast.info("It's 1:00 PM. Please take your lunch break.");
          localStorage.setItem(lunchKey, "1");
        }, lunchAt.getTime() - now.getTime());
      }

      const nowAfterLunch = new Date();
      if (nowAfterLunch < lunchDoneAt && localStorage.getItem(followKey) !== "1") {
        followTimer = window.setTimeout(() => {
          addNotification({
            title: "Break Duration Alert",
            body: "You have completed a 30-minute break.",
            type: "warning",
          });
          toast.warning("You have completed a 30-minute break.");
          localStorage.setItem(followKey, "1");
        }, lunchDoneAt.getTime() - nowAfterLunch.getTime());
      }
    };

    runSchedule();
    return () => {
      if (dayTimer) window.clearTimeout(dayTimer);
      if (followTimer) window.clearTimeout(followTimer);
    };
  }, [user, addNotification]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const initials = user?.name.split(" ").map((n) => n[0]).join("").slice(0, 2) ?? "??";

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
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
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
    // Auto-register only when permission already granted.
    if (Notification.permission === "granted") {
      void ensurePushSubscription(false);
    }
  }, [user, accessToken]);

  const handleBellClick = async () => {
    markNotificationsRead();
    if (accessToken) {
      await markNotificationsReadRequest(accessToken).catch(() => undefined);
    }
    const ok = await ensurePushSubscription(true);
    if (!ok && Notification.permission !== "granted") {
      toast.warning("Please allow browser notifications to receive reminders.");
    }
  };

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border/40 bg-background/50 backdrop-blur-2xl">
      {/* Animated gradient accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, #1D9E75, #25d499, #1D9E75, transparent)' }} />

      <div className="flex h-full items-center gap-2 sm:gap-4 px-3 sm:px-6">
        <SidebarTrigger className="shrink-0" />

        <div className="relative flex-1 max-w-md hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employees, requests, updates..."
            className="pl-9 h-10 bg-muted/30 backdrop-blur-sm border-border/40 focus-visible:ring-1 rounded-xl"
          />
        </div>

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
                <div className="hidden sm:flex flex-col items-start leading-tight">
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
