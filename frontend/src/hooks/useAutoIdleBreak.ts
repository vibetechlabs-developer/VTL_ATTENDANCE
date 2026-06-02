import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { attendanceBreakEndRequest, attendanceBreakStartRequest } from "@/lib/api";
import {
  IDLE_ACTIVITY_EVENT,
  IDLE_CLEAR_AUTO_FLAG_EVENT,
  REQUEST_SYSTEM_IDLE_EVENT,
} from "@/utils/idleActivity";
import { ensureNotificationPermission, showDesktopNotification } from "@/utils/desktopNotify";
import {
  getIdleDetectorClass,
  isWorkingInAnotherApp,
  querySystemIdlePermission,
  requestSystemIdlePermission,
  supportsSystemIdleDetection,
  type SystemIdleDetector,
} from "@/utils/systemIdle";

/** No keyboard/mouse activity anywhere on the PC → auto break after this duration. */
export const AUTO_IDLE_BREAK_MS = 10 * 60 * 1000;
const IDLE_POLL_MS = 15_000;
/** Prevent repeated auto-break loops creating tiny break entries. */
const AUTO_BREAK_REARM_MS = 30 * 60 * 1000;

type AttendanceStatus = "idle" | "checked-in" | "on-break" | "checked-out";

type IdleTrackingMode = "system" | "focus-safe" | "off";

type UseAutoIdleBreakOptions = {
  accessToken: string | null;
  status: AttendanceStatus;
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
  const lastAutoBreakEndAtRef = useRef<number>(0);
  const onCallModeRef = useRef(onCallMode);
  const statusRef = useRef(status);
  const trackingModeRef = useRef<IdleTrackingMode>("off");
  const systemDetectorRef = useRef<SystemIdleDetector | null>(null);
  const systemAbortRef = useRef<AbortController | null>(null);

  onCallModeRef.current = onCallMode;
  statusRef.current = status;

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
      if (trackingModeRef.current === "focus-safe" && isWorkingInAnotherApp()) return;
      const idleMs = Date.now() - lastActivityAtRef.current;
      if (idleMs < AUTO_IDLE_BREAK_MS) return;
      if (lastAutoBreakEndAtRef.current) {
        const sinceLastAutoBreakEnd = Date.now() - lastAutoBreakEndAtRef.current;
        if (sinceLastAutoBreakEnd < AUTO_BREAK_REARM_MS) return;
      }

      const res = await attendanceBreakStartRequest(token);
      if (!res.ok) return;
      autoIdleBreakActiveRef.current = true;
      startBreak(Date.now());
      void ensureNotificationPermission(true);
      const body =
        trackingModeRef.current === "system"
          ? "No keyboard or mouse activity on your PC for 10 minutes. Break started automatically."
          : "No activity on the attendance tab for 10 minutes while it was in focus. Break started automatically.";
      showDesktopNotification("You are on break", body, "vtl-attendance-idle-break");
      toast.info("You are on break — no PC activity for 10 minutes.", { duration: 8000 });
    };

    const triggerAutoResume = async () => {
      if (!autoIdleBreakActiveRef.current) return;
      if (statusRef.current !== "on-break") return;

      const res = await attendanceBreakEndRequest(token);
      if (!res.ok) return;
      autoIdleBreakActiveRef.current = false;
      lastAutoBreakEndAtRef.current = Date.now();
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

    const pauseIdleWhileAway = () => {
      bumpActivity();
    };

    const onGlobalActivity = () => markActive();
    const onClearAutoFlag = () => {
      autoIdleBreakActiveRef.current = false;
      lastAutoBreakEndAtRef.current = Date.now();
    };

    const stopSystemDetector = () => {
      systemAbortRef.current?.abort();
      systemAbortRef.current = null;
      systemDetectorRef.current = null;
    };

    const attachSystemDetector = async (): Promise<boolean> => {
      const IdleDetector = getIdleDetectorClass();
      if (!IdleDetector || disposed) return false;

      const permission = await querySystemIdlePermission();
      if (permission !== "granted") return false;

      stopSystemDetector();
      try {
        const detector = new IdleDetector();
        const onChange = () => {
          if (onCallModeRef.current) {
            if (detector.userState === "active") bumpActivity();
            return;
          }
          if (detector.userState === "idle") {
            void triggerAutoBreak();
          } else if (detector.userState === "active") {
            bumpActivity();
            if (autoIdleBreakActiveRef.current) void triggerAutoResume();
          }
        };
        detector.addEventListener("change", onChange);
        const ac = new AbortController();
        systemAbortRef.current = ac;
        systemDetectorRef.current = detector;
        await detector.start({ threshold: AUTO_IDLE_BREAK_MS, signal: ac.signal });
        trackingModeRef.current = "system";
        return true;
      } catch {
        stopSystemDetector();
        return false;
      }
    };

    const tryActivateSystemIdle = async (fromUserGesture: boolean) => {
      if (disposed || trackingModeRef.current === "system") return;

      let permission = await querySystemIdlePermission();
      if (permission === "prompt" && fromUserGesture) {
        permission = await requestSystemIdlePermission();
      }
      if (permission !== "granted") {
        trackingModeRef.current = supportsSystemIdleDetection() ? "focus-safe" : "focus-safe";
        return;
      }

      const ok = await attachSystemDetector();
      if (!ok) trackingModeRef.current = "focus-safe";
    };

    const onRequestSystemIdle = () => {
      void tryActivateSystemIdle(true);
    };

    window.addEventListener(IDLE_ACTIVITY_EVENT, onGlobalActivity);
    window.addEventListener(IDLE_CLEAR_AUTO_FLAG_EVENT, onClearAutoFlag);
    window.addEventListener(REQUEST_SYSTEM_IDLE_EVENT, onRequestSystemIdle);

    const tabEvents: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "wheel",
      "touchstart",
      "scroll",
    ];
    tabEvents.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    window.addEventListener("focus", markActive);
    window.addEventListener("blur", pauseIdleWhileAway);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pauseIdleWhileAway();
      else markActive();
    });

    /** Without OS permission we never auto-break (avoids false breaks while using VS Code / other apps). */
    const pollFocusSafeIdle = () => {
      if (trackingModeRef.current !== "focus-safe") return;
      if (isWorkingInAnotherApp()) pauseIdleWhileAway();
    };

    const pollInterval = window.setInterval(pollFocusSafeIdle, IDLE_POLL_MS);

    void (async () => {
      const granted = await attachSystemDetector();
      if (!granted && !disposed) {
        trackingModeRef.current = "focus-safe";
      }
    })();

    return () => {
      disposed = true;
      trackingModeRef.current = "off";
      stopSystemDetector();
      window.removeEventListener(IDLE_ACTIVITY_EVENT, onGlobalActivity);
      window.removeEventListener(IDLE_CLEAR_AUTO_FLAG_EVENT, onClearAutoFlag);
      window.removeEventListener(REQUEST_SYSTEM_IDLE_EVENT, onRequestSystemIdle);
      tabEvents.forEach((ev) => window.removeEventListener(ev, markActive));
      window.removeEventListener("focus", markActive);
      window.removeEventListener("blur", pauseIdleWhileAway);
      window.clearInterval(pollInterval);
    };
  }, [accessToken, status, onCallMode, startBreak, endBreak]);

  return { bumpActivity, autoIdleBreakActiveRef };
}

export async function ensureSystemIdlePermission(prompt = false): Promise<boolean> {
  if (!supportsSystemIdleDetection()) {
    if (prompt) {
      toast.error(
        "Use Chrome or Edge for PC-wide auto-break. Other browsers cannot detect activity in VS Code or other apps.",
      );
    }
    return false;
  }
  let state = await querySystemIdlePermission();
  if (state === "prompt") {
    state = await requestSystemIdlePermission();
  }
  if (state === "granted") {
    window.dispatchEvent(new CustomEvent(REQUEST_SYSTEM_IDLE_EVENT));
    return true;
  }
  if (prompt) {
    toast.error(
      'Click "Allow" for idle detection so auto-break only runs when you are truly away from the PC (not while using VS Code or other apps).',
      { duration: 12000 },
    );
  }
  return false;
}
