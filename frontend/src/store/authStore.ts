import { create } from "zustand";
import { persist } from "zustand/middleware";
import { logoutRequest } from "@/lib/api";

export type Role = "admin" | "manager" | "employee" | "hr";

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
  department: string;
  phone: string;
  bio: string;
  location: string;
  avatar?: string;
}

function mapBackendRole(role: string): Role {
  if (role === "manager") return "manager";
  if (role === "employee") return "employee";
  if (role === "hr") return "hr";
  return "admin";
}

export interface MeProfilePayload {
  id: string;
  email: string;
  role: string;
  name: string;
  department?: string;
  phone?: string;
  empId?: string;
  bio?: string;
  location?: string;
  avatar?: string | null;
}

export function profileToAuthUser(body: MeProfilePayload): AuthUser {
  return {
    id: body.id,
    name: body.name,
    email: body.email,
    empId: body.empId ?? `VTL-${body.id}`,
    role: mapBackendRole(body.role),
    department: body.department ?? "",
    phone: body.phone ?? "",
    bio: body.bio ?? "",
    location: body.location ?? "",
    avatar: body.avatar ?? undefined,
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
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<AuthUser>) => void;
  updatePreferences: (patch: Partial<UserPreferences>) => void;
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
      logout: async () => {
        const { accessToken, refreshToken } = get();
        if (accessToken && refreshToken) {
          try {
            await logoutRequest(accessToken, refreshToken);
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
      partialize: (s) => ({
        user: s.user,
        preferences: s.preferences,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
    }
  )
);
