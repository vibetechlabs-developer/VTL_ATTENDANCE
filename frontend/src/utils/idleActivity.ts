export const IDLE_ACTIVITY_EVENT = "vtl-idle-activity";
export const IDLE_CLEAR_AUTO_FLAG_EVENT = "vtl-idle-clear-auto-flag";
/** Fired after check-in / Enable click to start OS-wide idle tracking. */
export const REQUEST_SYSTEM_IDLE_EVENT = "vtl-request-system-idle";

/** Tell auto-break that the user is active (manual break, call mode, etc.). */
export function bumpGlobalIdleActivity(): void {
  window.dispatchEvent(new CustomEvent(IDLE_ACTIVITY_EVENT));
}

/** Manual break ended/started — do not treat as auto-break resume. */
export function clearGlobalAutoIdleFlag(): void {
  window.dispatchEvent(new CustomEvent(IDLE_CLEAR_AUTO_FLAG_EVENT));
}

/** Request PC-wide idle detection (call from a button / check-in handler). */
export function requestGlobalSystemIdleDetection(): void {
  window.dispatchEvent(new CustomEvent(REQUEST_SYSTEM_IDLE_EVENT));
}
