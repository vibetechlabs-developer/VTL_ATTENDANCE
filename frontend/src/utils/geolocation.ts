export type GeoPermissionState = PermissionState | "unsupported";

export type LocationResult = {
  latitude: number;
  longitude: number;
};

export function isGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.geolocation);
}

export async function queryGeolocationPermission(): Promise<GeoPermissionState> {
  if (!isGeolocationSupported()) return "unsupported";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "prompt";
  }
}

function detectMobileOs(): "android" | "ios" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

export function geolocationDeniedTips(): string[] {
  const os = detectMobileOs();
  if (os === "android") {
    return [
      "Turn ON Location in phone Settings",
      "Settings → Apps → Chrome → Permissions → Location → Allow",
      "Tap the lock icon in Chrome → Site settings → Location → Allow",
      "Then tap Retry scan on this screen",
    ];
  }
  if (os === "ios") {
    return [
      "Settings → Privacy → Location Services → ON",
      "Settings → Safari (or Chrome) → Location → While Using the App",
      "Allow location when Safari/Chrome asks",
      "Then tap Retry scan",
    ];
  }
  return [
    "Allow location when the browser asks",
    "Check site permissions in browser settings (lock icon in address bar)",
    "Turn on GPS/location on your device",
    "Then tap Retry scan",
  ];
}

export function geolocationErrorMessage(code: number | undefined): string {
  if (code === 1) return "location permission denied";
  if (code === 2) return "location position unavailable";
  if (code === 3) return "location timeout expired";
  return "location unknown error";
}

/**
 * Warm up GPS while the user does the face scan (modal opened from a tap = permission prompt allowed).
 */
export function warmupGeolocation(): void {
  if (!isGeolocationSupported()) return;
  navigator.geolocation.getCurrentPosition(
    () => {},
    () => {},
    { enableHighAccuracy: false, maximumAge: 120_000, timeout: 12_000 },
  );
}

export function validateCoordinates(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("location position unavailable");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error("location position unavailable");
  }
}

export function getCurrentLocation(options?: { highAccuracy?: boolean }): Promise<LocationResult> {
  const highAccuracy = options?.highAccuracy ?? true;
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        try {
          validateCoordinates(latitude, longitude);
        } catch (e) {
          reject(e);
          return;
        }
        resolve({ latitude, longitude });
      },
      (err) => reject(err),
      {
        enableHighAccuracy: highAccuracy,
        timeout: highAccuracy ? 25_000 : 15_000,
        maximumAge: 60_000,
      },
    );
  });
}
