import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Safe display helpers (avoid `user?.name.split` crashes when name is missing). */
export function userInitials(name?: string | null, fallback = "??"): string {
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  return trimmed
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function userFirstName(name?: string | null, fallback = "there"): string {
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  return trimmed.split(/\s+/)[0] ?? fallback;
}
