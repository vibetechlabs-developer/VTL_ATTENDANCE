import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { attendanceBreakEndRequest, attendanceBreakStartRequest } from "@/lib/api";
import { IDLE_ACTIVITY_EVENT, IDLE_CLEAR_AUTO_FLAG_EVENT } from "@/utils/idleActivity";
import { ensureNotificationPermission, showDesktopNotification } from "@/utils/desktopNotify";
import {
  getIdleDetectorClass,
  requestSystemIdlePermission,
  supportsSystemIdleDetection,
} from "@/utils/systemIdle";

/** No keyboard/mouse activity anywhere on the PC → auto break after this duration. */
export const AUTO_IDLE_BREAK_MS = 10 * 60 * 1000;
const IDLE_POLL_MS = 15_000;

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
  const statusRef = useRef(status);
  const accessTokenRef = useRef(accessToken);
  const systemIdleActiveRef = useRef(false);

  onCallModeRef.current = onCallMode;
  statusRef.current = status;
  accessTokenRef.current = accessToken;

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
    const token = accessToken;
    if (!token) return;

    let disposed = false;

    const triggerAutoBreak = async () => {
      if (statusRef.current !== "checked-in") return;
      if (onCallModeRef.current) return;
      if (autoIdleBreakActiveRef.current) return;

      const res = await attendanceBreakStartRequest(token);
      if (!res.ok) return;
      autoIdleBreakActiveRef.current = true;
      startBreak(Date.now());
      void ensureNotificationPermission(true);
      showDesktopNotification(
        "You are on break",
        systemIdleActiveRef.current
          ? "No keyboard or mouse activity on your PC for 10 minutes. Break started automatically."
          : "No activity detected for 10 minutes. Break started automatically.",
        "vtl-attendance-idle-break",
      );
      toast.info("You are on break — no PC activity for 10 minutes.", { duration: 8000 });
    };

    const triggerAutoResume = async () => {
      if (!autoIdleBreakActiveRef.current) return;
      if (statusRef.current !== "on-break") return;

      const res = await attendanceBreakEndRequest(token);
      if (!res.ok) return;
      autoIdleBreakActiveRef.current = false;
      endBreak();
      showDesktopNotification(
        "Back on the clock",
        "Keyboard or mouse activity detected. Your automatic break has ended.",
        "vtl-attendance-idle-resume",
      );
      toast.success("Activity detected — you are back on the clock.");
    };

    const markActive = () => {
      bumpActivity();
      if (autoIdleBreakActiveRef.current && statusRef.current === "on-break") {
        void triggerAutoResume();
      }
    };

    const onGlobalActivity = () => markActive();
    const onClearAutoFlag = () => {
      autoIdleBreakActiveRef.current = false;
    };
    window.addEventListener(IDLE_ACTIVITY_EVENT, onGlobalActivity);
    window.addEventListener(IDLE_CLEAR_AUTO_FLAG_EVENT, onClearAutoFlag);

    const tabEvents: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "wheel",
      "touchstart",
      "scroll",
      "focus",
    ];
    tabEvents.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    let tabHiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.hidden) {
        tabHiddenAt = Date.now();
        return;
      }
      if (tabHiddenAt !== null) {
        const hiddenMs = Date.now() - tabHiddenAt;
        lastActivityAtRef.current += hiddenMs;
        tabHiddenAt = null;
      }
      markActive();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const pollTabIdle = () => {
      if (systemIdleActiveRef.current) return;
      if (statusRef.current !== "checked-in") return;
      if (onCallModeRef.current) return;
      if (autoIdleBreakActiveRef.current) return;
      if (document.hidden) return;

      const idleMs = Date.now() - lastActivityAtRef.current;
      if (idleMs >= AUTO_IDLE_BREAK_MS) {
        void triggerAutoBreak();
      }
    };

    const pollInterval = window.setInterval(pollTabIdle, IDLE_POLL_MS);

    const systemAbort = new AbortController();
    let systemListener: (() => void) | null = null;

    const startSystemIdle = async () => {
      const IdleDetector = getIdleDetectorClass();
      if (!IdleDetector || disposed) return false;

      let permission: PermissionState = "prompt";
      try {
        permission = await IdleDetector.requestPermission();
      } catch {
        permission = "denied";
      }
      if (permission !== "granted" || disposed) return false;

      try {
        const detector = new IdleDetector();
        systemListener = () => {
          if (onCallModeRef.current) {
            if (detector.userState === "active") bumpActivity();
            return;
          }
          if (detector.userState === "idle") {
            void triggerAutoBreak();
          } else if (detector.userState === "active") {
            bumpActivity();
            if (autoIdleBreakActiveRef.current) {
              void triggerAutoResume();
            }
          }
        };
        detector.addEventListener("change", systemListener);
        await detector.start({
          threshold: AUTO_IDLE_BREAK_MS,
          signal: systemAbort.signal,
        });
        systemIdleActiveRef.current = true;
        return true;
      } catch {
        systemIdleActiveRef.current = false;
        return false;
      }
    };

    void startSystemIdle();

    return () => {
      disposed = true;
      systemIdleActiveRef.current = false;
      systemAbort.abort();
      window.removeEventListener(IDLE_ACTIVITY_EVENT, onGlobalActivity);
      window.removeEventListener(IDLE_CLEAR_AUTO_FLAG_EVENT, onClearAutoFlag);
      tabEvents.forEach((ev) => window.removeEventListener(ev, markActive));
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(pollInterval);
      if (systemListener) {
        /* detector is aborted via signal; listener removed with GC */
      }
    };
  }, [accessToken, status, onCallMode, startBreak, endBreak]);

  return { clearAutoIdleFlag, bumpActivity, autoIdleBreakActiveRef };
}

/** Call from UI (e.g. after check-in) to request OS-wide idle permission. */
export async function ensureSystemIdlePermission(prompt = false): Promise<boolean> {
  if (!supportsSystemIdleDetection()) return false;
  const state = await requestSystemIdlePermission();
  if (state === "granted") return true;
  if (prompt && state === "denied") {
    toast.error("Allow “idle detection” in the browser site settings for PC-wide auto-break.");
  }
  return false;
}
