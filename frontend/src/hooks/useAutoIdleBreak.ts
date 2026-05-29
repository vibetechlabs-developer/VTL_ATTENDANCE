import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { attendanceBreakEndRequest, attendanceBreakStartRequest } from "@/lib/api";
import { ensureNotificationPermission, showDesktopNotification } from "@/utils/desktopNotify";

/** No keyboard/mouse/touch activity → auto break after this duration. */
export const AUTO_IDLE_BREAK_MS = 10 * 60 * 1000;
const IDLE_POLL_MS = 30_000;

type AttendanceStatus = "idle" | "checked-in" | "on-break" | "checked-out";

type UseAutoIdleBreakOptions = {
  accessToken: string | null;
  status: AttendanceStatus;
  /** Sales: on a phone call — PC may be idle; do not start auto-break. */
  onCallMode: boolean;
  startBreak: (breakStartAt?: number) => void;
  endBreak: () => void;
};

export function useAutoIdleBreak({
  accessToken,
  status,
  onCallMode,
  startBreak,
  endBreak,
}: UseAutoIdleBreakOptions) {
  const lastActivityAtRef = useRef(Date.now());
  const autoIdleBreakActiveRef = useRef(false);
  const onCallModeRef = useRef(onCallMode);
  onCallModeRef.current = onCallMode;

  const clearAutoIdleFlag = () => {
    autoIdleBreakActiveRef.current = false;
  };

  const bumpActivity = () => {
    lastActivityAtRef.current = Date.now();
  };

  useEffect(() => {
    if (onCallMode) bumpActivity();
  }, [onCallMode]);

  useEffect(() => {
    if (!accessToken) return;

    const markActive = () => {
      const wasAutoBreak = autoIdleBreakActiveRef.current;
      lastActivityAtRef.current = Date.now();
      if (wasAutoBreak && status === "on-break") {
        autoIdleBreakActiveRef.current = false;
        void attendanceBreakEndRequest(accessToken).then(async (res) => {
          if (!res.ok) return;
          endBreak();
          showDesktopNotification(
            "Back on the clock",
            "PC activity detected. Your automatic break has ended.",
            "vtl-attendance-idle-resume",
          );
          toast.success("Activity detected — you are back on the clock.");
        });
      }
    };

    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    const interval = window.setInterval(() => {
      if (status !== "checked-in") return;
      if (onCallModeRef.current) return;
      if (autoIdleBreakActiveRef.current) return;

      const idleMs = Date.now() - lastActivityAtRef.current;
      if (idleMs < AUTO_IDLE_BREAK_MS) return;

      void attendanceBreakStartRequest(accessToken).then(async (res) => {
        if (!res.ok) return;
        autoIdleBreakActiveRef.current = true;
        startBreak(Date.now());
        void ensureNotificationPermission(true);
        showDesktopNotification(
          "You are on break",
          "No PC activity for 10 minutes. Break started automatically. Use your mouse or keyboard when you return to work.",
          "vtl-attendance-idle-break",
        );
        toast.info("You are on break — no PC activity for 10 minutes.", { duration: 8000 });
      });
    }, IDLE_POLL_MS);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActive));
      window.clearInterval(interval);
    };
  }, [accessToken, status, onCallMode, startBreak, endBreak]);

  return { clearAutoIdleFlag, bumpActivity, autoIdleBreakActiveRef };
}
