/** Chrome / Edge: OS-wide keyboard & mouse idle (not limited to this tab). */
export function supportsSystemIdleDetection(): boolean {
  return typeof window !== "undefined" && "IdleDetector" in window;
}

export type SystemIdleDetector = {
  userState: "active" | "idle";
  screenState: "locked" | "unlocked";
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
  start(options?: { threshold?: number; signal?: AbortSignal }): Promise<void>;
};

type IdleDetectorCtor = {
  new (): SystemIdleDetector;
  requestPermission(): Promise<PermissionState>;
};

export function getIdleDetectorClass(): IdleDetectorCtor | null {
  if (!supportsSystemIdleDetection()) return null;
  return (window as Window & { IdleDetector?: IdleDetectorCtor }).IdleDetector ?? null;
}

/** Query current permission without prompting (when supported). */
export async function querySystemIdlePermission(): Promise<PermissionState> {
  if (!supportsSystemIdleDetection()) return "denied";
  try {
    const status = await navigator.permissions.query({
      name: "idle-detection" as PermissionName,
    });
    return status.state;
  } catch {
    return "prompt";
  }
}

/** Must be called from a user click (check-in, Enable button). */
export async function requestSystemIdlePermission(): Promise<PermissionState> {
  const IdleDetector = getIdleDetectorClass();
  if (!IdleDetector) return "denied";
  try {
    return await IdleDetector.requestPermission();
  } catch {
    return "denied";
  }
}

export function isWorkingInAnotherApp(): boolean {
  if (typeof document === "undefined") return false;
  return document.hidden || !document.hasFocus();
}
