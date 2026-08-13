import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeGetItem, safeRemoveItem, safeSetItem } from "@/utils/storageSafe";

export type Role = "admin" | "manager" | "employee" | "hr" | "sales" | "intern";

/** Roles that land on /employee (personal portal) after login. */
export function roleUsesEmployeePortal(role: Role): boolean {
  return role === "employee" || role === "hr" || role === "manager" || role === "sales" || role === "intern";
}

export function userRoles(user: AuthUser | null): Role[] {
  if (!user) return [];
  if (user.roles?.length) return user.roles;
  return user.role ? [user.role] : [];
}

export function userHasRole(user: AuthUser | null, ...roles: Role[]): boolean {
  const list = userRoles(user);
  return roles.some((r) => list.includes(r));
}

export function defaultPortalPath(user: AuthUser): string {
  if (userHasRole(user, "admin", "manager")) return "/admin";
  return "/employee";
}

export function roleUsesEmployeePortalForUser(user: AuthUser): boolean {
  return defaultPortalPath(user) === "/employee";
}

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  emailNotifications: boolean;
  pushNotifications: boolean;
  weeklyReport: boolean;
  language: "en" | "hi" | "gu";
  timezone: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  empId: string;
  role: Role;
  roles?: Role[];
  department: string;
  phone: string;
  bio: string;
  location: string;
  avatar?: string;
  isWfh?: boolean;
}

function mapBackendRole(role: string): Role {
  if (role === "manager") return "manager";
  if (role === "employee") return "employee";
  if (role === "hr") return "hr";
  if (role === "sales") return "sales";
  return "admin";
}

export interface MeProfilePayload {
  id: string;
  email: string;
  role: string;
  roles?: string[];
  name: string;
  department?: string;
  phone?: string;
  empId?: string;
  bio?: string;
  location?: string;
  avatar?: string | null;
  isWfh?: boolean;
}

function mapBackendRoles(roles?: string[], fallbackRole?: string): Role[] {
  const raw = roles?.length ? roles : fallbackRole ? [fallbackRole] : ["employee"];
  const mapped = raw.map((r) => mapBackendRole(r));
  return [...new Set(mapped)];
}

export function profileToAuthUser(body: MeProfilePayload): AuthUser {
  const roles = mapBackendRoles(body.roles, body.role);
  const primary = mapBackendRole(body.role);
  return {
    id: body.id,
    name: body.name,
    email: body.email,
    empId: body.empId ?? `VTL-${body.id}`,
    role: roles.includes(primary) ? primary : roles[0],
    roles,
    department: body.department ?? "",
    phone: body.phone ?? "",
    bio: body.bio ?? "",
    location: body.location ?? "",
    avatar: body.avatar ?? undefined,
    isWfh: Boolean(body.isWfh),
  };
}

const defaultPrefs: UserPreferences = {
  theme: "system",
  emailNotifications: true,
  pushNotifications: true,
  weeklyReport: true,
  language: "en",
  timezone: "Asia/Kolkata",
};

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  preferences: UserPreferences;
  setSession: (user: AuthUser, access: string, refresh: string) => void;
  setAccessToken: (access: string | null) => void;
  clearSession: () => void;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<AuthUser>) => void;
  updatePreferences: (patch: Partial<UserPreferences>) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
function apiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      preferences: defaultPrefs,
      setSession: (user, access, refresh) =>
        set({ user, accessToken: access, refreshToken: refresh }),
      setAccessToken: (access) => set({ accessToken: access }),
      clearSession: () => set({ user: null, accessToken: null, refreshToken: null }),
      logout: async () => {
        const { accessToken, refreshToken } = get();
        if (accessToken && refreshToken) {
          try {
            await fetch(apiUrl("/api/users/logout/"), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ refresh: refreshToken }),
            });
          } catch {
            /* still clear local session */
          }
        }
        set({ user: null, accessToken: null, refreshToken: null });
      },
      updateProfile: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
      updatePreferences: (patch) =>
        set((s) => ({ preferences: { ...s.preferences, ...patch } })),
    }),
    {
      name: "vtl-auth",
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const raw = safeGetItem(localStorage, name);
          if (raw == null) return null;
          try {
            JSON.parse(raw);
            return raw;
          } catch {
            safeRemoveItem(localStorage, name);
            return null;
          }
        },
        setItem: (name, value) => safeSetItem(localStorage, name, value),
        removeItem: (name) => safeRemoveItem(localStorage, name),
      })),
      partialize: (s) => ({
        user: s.user,
        preferences: s.preferences,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
    }
  )
);
