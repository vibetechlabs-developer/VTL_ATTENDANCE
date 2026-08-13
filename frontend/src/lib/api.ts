import { useAuthStore } from "@/store/authStore";

/** Base for split deployments (e.g. VITE_API_BASE=https://api.example.com). Empty uses same-origin / Vite proxy. */
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function apiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch(apiUrl("/api/users/token/refresh/"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
  });
  const body = (await res.json().catch(() => ({}))) as { access?: string };
  if (!res.ok || !body.access) return null;
  return body.access;
}

async function fetchWithAutoRefresh(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = accessToken || useAuthStore.getState().accessToken || "";
  const headers = new Headers(init.headers || {});
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  let res = await fetch(apiUrl(path), { ...init, headers });
  if (res.status !== 401) return res;

  const store = useAuthStore.getState();
  const refreshToken = store.refreshToken;
  if (!refreshToken) return res;

  const newAccess = await refreshAccessToken(refreshToken);
  if (!newAccess) {
    store.clearSession();
    return res;
  }

  store.setAccessToken(newAccess);
  const retryHeaders = new Headers(init.headers || {});
  retryHeaders.set("Authorization", `Bearer ${newAccess}`);
  res = await fetch(apiUrl(path), { ...init, headers: retryHeaders });
  return res;
}

export async function loginRequest(email: string, password: string): Promise<Response> {
  return fetch(apiUrl("/api/users/login/"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function meRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/users/me/");
}

export async function logoutRequest(accessToken: string, refreshToken: string): Promise<Response> {
  return fetch(apiUrl("/api/users/logout/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ refresh: refreshToken }),
  });
}

export interface ApiEmployee {
  id: number | string;
  userId?: number | string;
  managerEmployeeId?: number | string | null;
  managerEmployeeIds?: (number | string)[];
  name: string;
  email: string;
  empId: string;
  role: "admin" | "manager" | "employee" | "hr" | "sales";
  roles?: ("admin" | "manager" | "employee" | "hr" | "sales")[];
  department: string;
  managerUserId?: number | string | null;
  reportsTo?: string;
  joiningDate?: string;
  faceStatus?: "registered" | "pending";
  avatar?: string | null;
  status?: "active" | "inactive";
  hasEmployeeProfile?: boolean;
  isWfh?: boolean;
}

export async function usersListRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/users/employees/");
}

export interface CreateEmployeePayload {
  name: string;
  email: string;
  role?: "admin" | "manager" | "employee" | "hr" | "sales";
  roles?: ("admin" | "manager" | "employee" | "hr" | "sales")[];
  department: string;
  manager_id?: number | null;
  manager_employee_id?: number | null;
  manager_employee_ids?: number[];
  phone?: string;
  password?: string;
  is_wfh?: boolean;
}

export async function usersCreateRequest(accessToken: string, payload: CreateEmployeePayload): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/users/employees/create/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export interface UpdateEmployeePayload {
  name?: string;
  email?: string;
  role?: "admin" | "manager" | "employee" | "hr" | "sales";
  roles?: ("admin" | "manager" | "employee" | "hr" | "sales")[];
  department?: string;
  manager_id?: number | null;
  manager_employee_id?: number | null;
  manager_employee_ids?: number[];
  phone?: string;
  password?: string;
  is_wfh?: boolean;
}

export async function usersUpdateRequest(accessToken: string, employeeId: string, payload: UpdateEmployeePayload): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, `/api/users/employees/${employeeId}/update/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function usersDeleteRequest(accessToken: string, employeeId: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, `/api/users/employees/${employeeId}/delete/`, {
    method: "DELETE",
  });
}

export async function usersRegisterFaceRequest(accessToken: string, employeeId: string, imageBase64: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, `/api/users/employees/${employeeId}/register-face/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageBase64 }),
  });
}

export async function usersFaceDataRequest(accessToken: string, employeeId: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, `/api/users/employees/${employeeId}/face-data/`);
}

export async function registerFaceRequest(accessToken: string, imageBase64: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/attendance/register-face/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageBase64 }),
  });
}

export async function attendanceCheckInRequest(
  accessToken: string,
  payload: { image: string; latitude: number; longitude: number }
): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/attendance/check-in/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function attendanceCheckOutRequest(
  accessToken: string,
  payload: {
    image: string;
    latitude: number;
    longitude: number;
    allow_outside_meeting?: boolean;
    outside_note?: string;
  }
): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/attendance/check-out/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function attendanceBreakStartRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/attendance/break/start/", { method: "POST" });
}

export async function attendanceBreakEndRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/attendance/break/end/", { method: "POST" });
}

export async function attendanceCallStartRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/attendance/call/start/", { method: "POST" });
}

export async function attendanceCallEndRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/attendance/call/end/", { method: "POST" });
}

export async function attendanceHistoryRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/attendance/history/");
}

export async function attendanceSessionRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/attendance/session/");
}

export async function attendanceOvertimeNotifyRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/attendance/overtime-notify/", { method: "POST" });
}

export async function appraisalCreateRequest(
  accessToken: string,
  payload: { employee_id: number | string; rating: number; message: string }
): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/users/appraisals/create/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function myAppraisalsRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/users/appraisals/mine/");
}

export async function attendanceAdminRequest(accessToken: string, date: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, `/api/attendance/admin/?date=${encodeURIComponent(date)}`);
}

export async function attendanceAdminOverviewRequest(
  accessToken: string,
  days = 7,
): Promise<Response> {
  const q = `days=${encodeURIComponent(String(days))}`;
  const paths = [
    `/api/attendance/admin/overview/?${q}`,
    `/api/attendance/overview/?${q}`,
    `/api/overview/?${q}`,
    `/overview/?${q}`,
  ];
  let last: Response | null = null;
  for (const path of paths) {
    const res = await fetchWithAutoRefresh(accessToken, path);
    if (res.ok) return res;
    if (res.status !== 404) return res;
    last = res;
  }
  return last!;
}

export async function attendanceAdminHistoryRequest(
  accessToken: string,
  payload: { employee_id: string | number; from: string; to: string }
): Promise<Response> {
  const qs = new URLSearchParams({
    employee_id: String(payload.employee_id),
    from: payload.from,
    to: payload.to,
  });
  return fetchWithAutoRefresh(accessToken, `/api/attendance/admin/history/?${qs.toString()}`);
}

export async function attendanceForceCheckoutRequest(
  accessToken: string,
  payload: { employee_id: string | number; date: string }
): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/attendance/admin/force-checkout/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type LeaveTypeApi = "casual" | "sick" | "earned" | "exam" | "college" | "other";

export async function leaveBalanceRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/leaves/balance/");
}

export async function leaveHistoryRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/leaves/history/");
}

export async function leaveApplyRequest(
  accessToken: string,
  payload: {
    leave_type: LeaveTypeApi;
    start_date: string;
    end_date: string;
    reason: string;
    is_half_day?: boolean;
  }
): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/leaves/apply/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function meUpdateRequest(
  accessToken: string,
  payload: {
    name?: string;
    email?: string;
    phone?: string;
    department?: string;
    password?: string;
  }
): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/users/me/update/", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function leavePendingRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/leaves/pending/");
}

export async function leaveSummaryRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/leaves/summary/");
}

export async function auditLogsRequest(
  accessToken: string,
  params?: { q?: string; type?: string; from?: string; to?: string }
): Promise<Response> {
  const query = new URLSearchParams();
  if (params?.q) query.set("q", params.q);
  if (params?.type) query.set("type", params.type);
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchWithAutoRefresh(accessToken, `/api/users/audit-logs/${suffix}`);
}

export async function securityOverviewRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/users/security-overview/");
}

export async function pushPublicKeyRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/users/push/public-key/");
}

export async function pushSubscribeRequest(accessToken: string, subscription: PushSubscriptionJSON): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/users/push/subscribe/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription }),
  });
}

export async function pushUnsubscribeRequest(accessToken: string, endpoint: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/users/push/unsubscribe/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

export async function myNotificationsRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/users/notifications/");
}

export async function markNotificationsReadRequest(accessToken: string): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/users/notifications/mark-read/", { method: "POST" });
}

export async function updatesRequest(accessToken: string, params?: { all?: boolean; date?: string; employee_id?: string }): Promise<Response> {
  const query = new URLSearchParams();
  if (params?.all) query.set("all", "1");
  if (params?.date && params.date !== "all") query.set("date", params.date);
  if (params?.employee_id) query.set("employee_id", params.employee_id);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchWithAutoRefresh(accessToken, `/api/updates/${suffix}`);
}

export async function updatesPostRequest(
  accessToken: string,
  updateText: string,
  reportData?: Record<string, any>,
  date?: string
): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, "/api/updates/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      update_text: updateText,
      report_data: reportData,
      ...(date ? { date } : {}),
    }),
  });
}

export async function updatesDeleteRequest(accessToken: string, updateId: string | number): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, `/api/updates/${updateId}/`, {
    method: "DELETE",
  });
}

export async function leaveApproveRequest(accessToken: string, id: string | number): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, `/api/leaves/${id}/approve/`, { method: "PATCH" });
}

export async function leaveRejectRequest(accessToken: string, id: string | number): Promise<Response> {
  return fetchWithAutoRefresh(accessToken, `/api/leaves/${id}/reject/`, { method: "PATCH" });
}
