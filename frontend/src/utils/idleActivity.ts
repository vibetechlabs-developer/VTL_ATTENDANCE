export const IDLE_ACTIVITY_EVENT = "vtl-idle-activity";
export const IDLE_CLEAR_AUTO_FLAG_EVENT = "vtl-idle-clear-auto-flag";

/** Tell auto-break that the user is active (manual break, call mode, etc.). */
export function bumpGlobalIdleActivity(): void {
  window.dispatchEvent(new CustomEvent(IDLE_ACTIVITY_EVENT));
}

/** Manual break ended/started — do not treat as auto-break resume. */
export function clearGlobalAutoIdleFlag(): void {
  window.dispatchEvent(new CustomEvent(IDLE_CLEAR_AUTO_FLAG_EVENT));
}
