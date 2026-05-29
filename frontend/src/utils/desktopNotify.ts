const NOTIFY_ICON = "/vtl-transperent.png";

export function canUseDesktopNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function ensureNotificationPermission(ask = false): Promise<boolean> {
  if (!canUseDesktopNotifications()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  if (!ask) return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** System notification (requires permission). Falls back silently if blocked. */
export function showDesktopNotification(title: string, body: string, tag = "vtl-attendance-idle"): void {
  if (!canUseDesktopNotifications() || Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, {
      body,
      tag,
      icon: NOTIFY_ICON,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    /* private mode / unsupported */
  }
}
