import { format as fnsFormat, eachDayOfInterval as fnsEachDay } from "date-fns";

/**
 * Parse API date/time strings safely (Safari is strict about ISO formats).
 */
export function parseApiDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  let s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (s.includes(" ") && !s.includes("T")) {
    s = s.replace(" ", "T");
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatApiDate(
  value: string | number | Date | null | undefined,
  pattern: string,
  fallback = "—",
): string {
  const d = parseApiDate(value);
  if (!d) return fallback;
  try {
    return fnsFormat(d, pattern);
  } catch {
    return fallback;
  }
}

export function safeEachDayOfInterval(start: Date, end: Date): Date[] {
  if (start.getTime() > end.getTime()) return [];
  try {
    return fnsEachDay({ start, end });
  } catch {
    return [];
  }
}
