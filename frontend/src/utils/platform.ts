/** True on iPhone, iPad, and iPadOS desktop UA. */
export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Push / Notification API is unreliable in iOS browser tabs — skip entirely. */
export function canUseWebPush(): boolean {
  if (isIosDevice()) return false;
  if (typeof window === "undefined") return false;
  return (
    typeof Notification !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}
