/** Chrome / Edge: OS-wide keyboard & mouse idle (not limited to this tab). */
export function supportsSystemIdleDetection(): boolean {
  return typeof window !== "undefined" && "IdleDetector" in window;
}

type IdleDetectorCtor = {
  new (): {
    userState: "active" | "idle";
    screenState: "locked" | "unlocked";
    addEventListener(type: "change", listener: () => void): void;
    removeEventListener(type: "change", listener: () => void): void;
    start(options?: { threshold?: number; signal?: AbortSignal }): Promise<void>;
  };
  requestPermission(): Promise<PermissionState>;
};

export function getIdleDetectorClass(): IdleDetectorCtor | null {
  if (!supportsSystemIdleDetection()) return null;
  return (window as Window & { IdleDetector?: IdleDetectorCtor }).IdleDetector ?? null;
}

export async function requestSystemIdlePermission(): Promise<PermissionState> {
  const IdleDetector = getIdleDetectorClass();
  if (!IdleDetector) return "denied";
  try {
    return await IdleDetector.requestPermission();
  } catch {
    return "denied";
  }
}
