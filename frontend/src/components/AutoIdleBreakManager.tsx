import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAutoIdleBreak, ensureSystemIdlePermission } from "@/hooks/useAutoIdleBreak";
import { attendanceSessionRequest } from "@/lib/api";
import { useAttendanceStore } from "@/store/attendanceStore";
import { useAuthStore } from "@/store/authStore";
import {
  applyAttendanceSession,
  isOnCallFromSession,
  type AttendanceSessionBody,
} from "@/utils/attendanceSession";
import { canUseDesktopNotifications, ensureNotificationPermission } from "@/utils/desktopNotify";
import { supportsSystemIdleDetection } from "@/utils/systemIdle";
import { safeGetItem, safeSetItem } from "@/utils/storageSafe";

/**
 * Runs 10-minute auto-break while checked in — works across all employee routes
 * and uses OS-wide idle detection when the browser allows it.
 */
export function AutoIdleBreakManager() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const status = useAttendanceStore((s) => s.status);
  const startBreak = useAttendanceStore((s) => s.startBreak);
  const endBreak = useAttendanceStore((s) => s.endBreak);
  const hydrateSession = useAttendanceStore((s) => s.hydrateSession);
  const reset = useAttendanceStore((s) => s.reset);

  const [onCallMode, setOnCallMode] = useState(false);

  const refreshSession = useCallback(async () => {
    if (!accessToken) return;
    const res = await attendanceSessionRequest(accessToken);
    if (!res.ok) return;
    const body = (await res.json().catch(() => ({}))) as AttendanceSessionBody;
    applyAttendanceSession(body, hydrateSession, reset);
    setOnCallMode(isOnCallFromSession(body));
  }, [accessToken, hydrateSession, reset]);

  useEffect(() => {
    if (!accessToken) return;
    void refreshSession();
  }, [accessToken, refreshSession]);

  useEffect(() => {
    if (!accessToken) return;
    if (status !== "checked-in" && status !== "on-break") return;
    const interval = window.setInterval(() => void refreshSession(), 60_000);
    return () => window.clearInterval(interval);
  }, [accessToken, status, refreshSession]);

  useAutoIdleBreak({
    accessToken,
    status,
    onCallMode,
    startBreak,
    endBreak,
  });

  useEffect(() => {
    if (status !== "checked-in" || !user?.empId) return;

    const idleKey = `vtl_system_idle_hint_${user.empId}`;
    if (supportsSystemIdleDetection() && safeGetItem(localStorage, idleKey) !== "1") {
      safeSetItem(localStorage, idleKey, "1");
      toast("Enable PC-wide idle detection for auto-break (works while you use other apps).", {
        duration: 10000,
        action: {
          label: "Enable",
          onClick: () => {
            void ensureSystemIdlePermission(true);
          },
        },
      });
    }

    if (!canUseDesktopNotifications() || Notification.permission !== "default") return;
    const notifyKey = `vtl_idle_notify_hint_${user.empId}`;
    if (safeGetItem(localStorage, notifyKey) === "1") return;
    safeSetItem(localStorage, notifyKey, "1");
    toast("Enable desktop notifications for auto-break alerts.", {
      duration: 8000,
      action: {
        label: "Enable",
        onClick: () => {
          void ensureNotificationPermission(true);
        },
      },
    });
  }, [status, user?.empId]);

  return null;
}
