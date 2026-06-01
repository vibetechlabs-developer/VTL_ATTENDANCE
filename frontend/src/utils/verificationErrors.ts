import { geolocationDeniedTips } from "@/utils/geolocation";

export type VerificationError = {
  title: string;
  message: string;
  tips?: string[];
};

const CHECK_IN_FAIL = "Check-in couldn't be completed.";
const CHECK_OUT_FAIL = "Check-out couldn't be completed.";

function looksTechnical(raw: string): boolean {
  return /score\s*[\d.]|required\s*<=|face_distance|threshold|HTTP\s*\d{3}|traceback|exception|status\s*code/i.test(
    raw
  );
}

/** Turn any API/client/camera error into plain language for check-in & check-out. */
export function toVerificationError(
  raw: string,
  mode: "check-in" | "check-out",
  context: "face" | "location" | "camera" | "general" = "general"
): VerificationError {
  const hay = (raw || "").toLowerCase().trim();
  const fail = mode === "check-in" ? CHECK_IN_FAIL : CHECK_OUT_FAIL;

  if (/token not valid|token is invalid|token is expired|session has expired|sign in again/i.test(raw)) {
    return {
      title: "Session expired",
      message: "Please sign out, sign in again, and retry.",
      tips: ["Close this window and log in from the home page"],
    };
  }

  if (/timeout|timed out|timeout expired/i.test(hay)) {
    if (context === "location" || /position|geolocation|gps|location/i.test(hay)) {
      return {
        title: "Location timed out",
        message: "We couldn't get your GPS position in time.",
        tips: [
          "Turn on location/GPS for this site in browser settings",
          "Move near a window or step outside briefly",
          "Tap Retry scan after GPS is enabled",
        ],
      };
    }
    return {
      title: "Connection timed out",
      message: "The request took too long. Check your internet and try again.",
      tips: ["Switch to a stronger Wi‑Fi or mobile data signal"],
    };
  }

  if (
    /face mismatch|does not match|doesn't match|face does not match|score\s*[\d.]|required\s*<=/i.test(
      hay
    )
  ) {
    return {
      title: "Face not recognized",
      message: "Your face didn't match the photo saved on your account.",
      tips: [
        "Look straight at the camera",
        "Remove hat, mask, or sunglasses",
        "Use good, even lighting on your face",
        "Tap Retry scan when you're ready",
      ],
    };
  }

  if (/face not detected|no face|could not see your face|can't see your face/i.test(hay)) {
    return {
      title: "Face not visible",
      message: "We couldn't detect a clear face in the camera.",
      tips: [
        "Center your face inside the circle",
        "Move closer and hold still for a few seconds",
        "Avoid backlighting (bright window behind you)",
      ],
    };
  }

  if (/not registered|register your face|register face first/i.test(hay)) {
    return {
      title: "Face not set up",
      message: "Your account doesn't have a registered face photo yet.",
      tips: ["Ask your admin to register your face", "Or register from Profile if available"],
    };
  }

  if (/outside|office radius|allowed radius|check-in zone|check-in area/i.test(hay)) {
    const distMatch = raw.match(/(\d+)\s*m/i);
    const distNote = distMatch ? ` You're about ${distMatch[1]} m from the office.` : "";
    return {
      title: "Outside office area",
      message: `You need to be within the allowed check-in radius to continue.${distNote}`,
      tips: ["Move closer to the office location", "Wait a moment for GPS to update, then retry"],
    };
  }

  if (/already checked in/i.test(hay)) {
    return {
      title: "Already checked in",
      message: "You're already checked in for today.",
    };
  }

  if (/no active check-in|check in first/i.test(hay)) {
    return {
      title: "Not checked in",
      message: "Please check in before checking out.",
    };
  }

  if (/verification service unavailable|face_recognition|temporarily unavailable/i.test(hay)) {
    return {
      title: "Face check unavailable",
      message: "Our face verification service is busy right now.",
      tips: ["Wait a minute and tap Retry scan"],
    };
  }

  if (/permission denied|geolocation|location permission/i.test(hay)) {
    return {
      title: "Location blocked",
      message:
        "Check-in needs GPS on your phone. This is set per device — not your employee account. Other staff may have already allowed it.",
      tips: geolocationDeniedTips(),
    };
  }

  if (/position unavailable|unavailable/i.test(hay) && context === "location") {
    return {
      title: "GPS unavailable",
      message: "Your phone could not get a GPS fix. Turn on location services and try again.",
      tips: [
        "Enable Location/GPS in phone settings",
        "Move near a window or step outside briefly",
        "Disable battery saver for Chrome/Safari",
        "Tap Retry scan",
      ],
    };
  }

  if (/camera permission|notallowed|not allowed/i.test(hay) && /camera/i.test(hay)) {
    return {
      title: "Camera blocked",
      message: "Please allow camera access to scan your face.",
      tips: ["Open browser settings → Site permissions → Camera → Allow"],
    };
  }

  if (/camera|video source|notreadable|not found/i.test(hay) && context === "camera") {
    return {
      title: "Camera problem",
      message: raw.length < 120 && !looksTechnical(raw) ? raw : "We couldn't start your camera.",
      tips: ["Close other apps using the camera (Zoom, Teams, etc.)", "Refresh the page and try again"],
    };
  }

  if (/network|failed to fetch|load failed|connection/i.test(hay)) {
    return {
      title: "Network error",
      message: "Couldn't reach the server. Check your connection.",
      tips: ["Verify Wi‑Fi or mobile data is working"],
    };
  }

  if (/invalid data/i.test(hay)) {
    return {
      title: "Something went wrong",
      message: "The app could not send your scan correctly. Please retry.",
      tips: ["Tap Retry scan", "Refresh the page and try again"],
    };
  }

  if (looksTechnical(raw)) {
    if (/face|verify|match/i.test(hay)) {
      return toVerificationError("face mismatch", mode, "face");
    }
    if (/location|position|gps/i.test(hay)) {
      return toVerificationError("timeout position", mode, "location");
    }
    return {
      title: "Something went wrong",
      message: fail,
      tips: ["Tap Retry scan", "Contact support if this keeps happening"],
    };
  }

  if (raw.length > 0 && raw.length <= 200) {
    return {
      title: context === "location" ? "Location check failed" : "Verification failed",
      message: raw,
      tips: ["Tap Retry scan to try again"],
    };
  }

  return {
    title: "Something went wrong",
    message: fail,
    tips: ["Tap Retry scan", "Contact your admin if the problem continues"],
  };
}

export function inferApiErrorContext(
  body: { error?: string; code?: string },
  rawText?: string
): "face" | "location" {
  const code = (body.code || "").toLowerCase();
  if (code === "outside_office") return "location";
  if (code.startsWith("face_")) return "face";
  const hay = `${body.error || ""} ${rawText || ""}`.toLowerCase();
  if (/face|match|detect|verify|registered profile|registered face/.test(hay)) return "face";
  if (/outside|radius|office|location|geofence/.test(hay)) return "location";
  return "face";
}

export function parseVerificationApiError(
  status: number,
  body: {
    error?: string;
    message?: string;
    detail?: string;
    code?: string;
    distance_meters?: number | null;
  },
  rawText: string | undefined,
  mode: "check-in" | "check-out",
  step: "face" | "location"
): VerificationError {
  const code = (body.code || "").toLowerCase();
  if (code === "face_not_registered") {
    return toVerificationError("register face first", mode, "face");
  }
  if (code === "face_mismatch") {
    return {
      title: "Face not recognized",
      message:
        "Your live photo didn't match your registered face. Lighting, angle, or an old registration photo can cause this.",
      tips: [
        "Look straight at the camera in good light",
        "Remove hat, mask, or heavy glasses",
        "Re-register your face from Profile (or ask admin to register again)",
        "Tap Retry scan",
      ],
    };
  }
  if (code === "face_not_detected") {
    return toVerificationError("face not detected", mode, "face");
  }
  if (code === "face_service_unavailable") {
    return {
      title: "Face check unavailable",
      message: "The server had trouble processing your face scan. The app is still running — please wait a few seconds and tap Retry scan.",
      tips: [
        "Do not stop the Django server between attempts",
        "If this repeats, restart runserver once and re-register your face",
      ],
    };
  }
  if (code === "outside_office") {
    const dist =
      body.distance_meters != null && Number.isFinite(body.distance_meters)
        ? ` You are about ${Math.round(body.distance_meters)} m from the office.`
        : "";
    return {
      title: "Outside office area",
      message: `You need to be within the allowed check-in radius to continue.${dist}`,
      tips: ["Move closer to the office location", "Wait a moment for GPS to update, then tap Retry scan"],
    };
  }
  if (code === "invalid_image") {
    return {
      title: "Image too large",
      message: "The photo from your camera was too big to process.",
      tips: ["Tap Retry scan", "Move closer to the camera"],
    };
  }

  const base = body.error || body.detail || body.message || rawText || "";
  let msg = base;
  if (body.distance_meters != null && Number.isFinite(body.distance_meters) && /outside|radius/i.test(msg)) {
    msg = `${msg} (${Math.round(body.distance_meters)} m away)`;
  }
  const err = toVerificationError(msg, mode, step === "location" ? "location" : "face");
  if (status === 403 && err.title === "Something went wrong") {
    return { title: "Not allowed", message: "You don't have permission for this action." };
  }
  return err;
}
