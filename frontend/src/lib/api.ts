/** Base for split deployments (e.g. VITE_API_BASE=https://api.example.com). Empty uses same-origin / Vite proxy. */
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function apiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

export async function loginRequest(email: string, password: string): Promise<Response> {
  return fetch(apiUrl("/api/users/login/"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function meRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/users/me/"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
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
  name: string;
  email: string;
  empId: string;
  role: "admin" | "manager" | "employee" | "hr";
  department: string;
  reportsTo?: string;
  joiningDate?: string;
  faceStatus?: "registered" | "pending";
  avatar?: string | null;
  status?: "active" | "inactive";
  hasEmployeeProfile?: boolean;
}

export async function usersListRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/users/employees/"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export interface CreateEmployeePayload {
  name: string;
  email: string;
  role: "admin" | "manager" | "employee" | "hr";
  department: string;
  phone?: string;
  password?: string;
}

export async function usersCreateRequest(accessToken: string, payload: CreateEmployeePayload): Promise<Response> {
  return fetch(apiUrl("/api/users/employees/create/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export interface UpdateEmployeePayload {
  name?: string;
  email?: string;
  role?: "admin" | "manager" | "employee" | "hr";
  department?: string;
  phone?: string;
  password?: string;
}

export async function usersUpdateRequest(accessToken: string, employeeId: string, payload: UpdateEmployeePayload): Promise<Response> {
  return fetch(apiUrl(`/api/users/employees/${employeeId}/update/`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function usersRegisterFaceRequest(accessToken: string, employeeId: string, imageBase64: string): Promise<Response> {
  return fetch(apiUrl(`/api/users/employees/${employeeId}/register-face/`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ image: imageBase64 }),
  });
}

export async function usersFaceDataRequest(accessToken: string, employeeId: string): Promise<Response> {
  return fetch(apiUrl(`/api/users/employees/${employeeId}/face-data/`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function registerFaceRequest(accessToken: string, imageBase64: string): Promise<Response> {
  return fetch(apiUrl("/api/attendance/register-face/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ image: imageBase64 }),
  });
}

export async function attendanceCheckInRequest(
  accessToken: string,
  payload: { image: string; latitude: number; longitude: number }
): Promise<Response> {
  return fetch(apiUrl("/api/attendance/check-in/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function attendanceCheckOutRequest(
  accessToken: string,
  payload: { image: string; latitude: number; longitude: number }
): Promise<Response> {
  return fetch(apiUrl("/api/attendance/check-out/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function attendanceBreakStartRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/attendance/break/start/"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function attendanceBreakEndRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/attendance/break/end/"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function attendanceHistoryRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/attendance/history/"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function attendanceSessionRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/attendance/session/"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function attendanceAdminRequest(accessToken: string, date: string): Promise<Response> {
  return fetch(apiUrl(`/api/attendance/admin/?date=${encodeURIComponent(date)}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function attendanceForceCheckoutRequest(
  accessToken: string,
  payload: { employee_id: string | number; date: string }
): Promise<Response> {
  return fetch(apiUrl("/api/attendance/admin/force-checkout/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export type LeaveTypeApi = "casual" | "sick" | "earned";

export async function leaveBalanceRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/leaves/balance/"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function leaveHistoryRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/leaves/history/"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
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
  return fetch(apiUrl("/api/leaves/apply/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function leavePendingRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/leaves/pending/"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function leaveSummaryRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/leaves/summary/"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
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
  return fetch(apiUrl(`/api/users/audit-logs/${suffix}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function securityOverviewRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/users/security-overview/"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function pushPublicKeyRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/users/push/public-key/"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function pushSubscribeRequest(accessToken: string, subscription: PushSubscriptionJSON): Promise<Response> {
  return fetch(apiUrl("/api/users/push/subscribe/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ subscription }),
  });
}

export async function pushUnsubscribeRequest(accessToken: string, endpoint: string): Promise<Response> {
  return fetch(apiUrl("/api/users/push/unsubscribe/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ endpoint }),
  });
}

export async function myNotificationsRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/users/notifications/"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function markNotificationsReadRequest(accessToken: string): Promise<Response> {
  return fetch(apiUrl("/api/users/notifications/mark-read/"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function updatesRequest(accessToken: string, params?: { all?: boolean; date?: string }): Promise<Response> {
  const query = new URLSearchParams();
  if (params?.all) query.set("all", "1");
  if (params?.date) query.set("date", params.date);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetch(apiUrl(`/api/updates/${suffix}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function updatesPostRequest(accessToken: string, updateText: string): Promise<Response> {
  return fetch(apiUrl("/api/updates/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ update_text: updateText }),
  });
}

export async function leaveApproveRequest(accessToken: string, id: string | number): Promise<Response> {
  return fetch(apiUrl(`/api/leaves/${id}/approve/`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function leaveRejectRequest(accessToken: string, id: string | number): Promise<Response> {
  return fetch(apiUrl(`/api/leaves/${id}/reject/`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
