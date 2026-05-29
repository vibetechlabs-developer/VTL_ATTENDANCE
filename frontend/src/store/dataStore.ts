import { create } from "zustand";
import type { ApiEmployee } from "@/lib/api";

export interface Employee {
  id: string;
  userId?: string;
  managerEmployeeId?: string;
  managerEmployeeIds?: string[];
  name: string;
  email: string;
  empId: string;
  role: "admin" | "manager" | "employee" | "hr" | "sales";
  roles?: ("admin" | "manager" | "employee" | "hr" | "sales")[];
  department: string;
  managerUserId?: string;
  reportsTo: string;
  joiningDate: string;
  faceStatus: "registered" | "pending";
  avatar?: string;
  status: "active" | "inactive";
  hasEmployeeProfile?: boolean;
  isWfh?: boolean;
}

export interface AttendanceRow {
  id: string;
  empId: string;
  name: string;
  department: string;
  date: string;
  checkIn: string;
  checkOut: string;
  hours: number;
  status: "Present" | "Late" | "Absent";
}

export interface LeaveRequest {
  id: string;
  empId: string;
  name: string;
  type: "Casual" | "Sick" | "Earned" | "Unpaid" | "Regularization";
  from: string;
  to: string;
  days: number;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  appliedOn: string;
  halfDay?: boolean;
}

export interface DailyUpdate {
  id: string;
  empId: string;
  name: string;
  role: string;
  text: string;
  timestamp: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  userId: string;
  role: string;
  action: string;
  resource: string;
  ip: string;
  status: "Success" | "Failed";
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  type: "info" | "success" | "warning";
}

interface DataState {
  employees: Employee[];
  attendance: AttendanceRow[];
  leaves: LeaveRequest[];
  updates: DailyUpdate[];
  audit: AuditLog[];
  notifications: AppNotification[];
  addEmployee: (e: Omit<Employee, "id">) => void;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  addLeave: (l: Omit<LeaveRequest, "id" | "status" | "appliedOn">) => void;
  setLeaveStatus: (id: string, status: LeaveRequest["status"]) => void;
  addUpdate: (u: Omit<DailyUpdate, "id" | "timestamp">) => void;
  forceCheckout: (id: string) => void;
  markNotificationsRead: () => void;
  addNotification: (n: Omit<AppNotification, "id" | "time" | "read"> & { time?: string }) => void;
  setEmployeesFromApi: (items: ApiEmployee[]) => void;
}

const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return iso(d);
};

const departments = ["Engineering", "Design", "Marketing", "Sales", "HR", "Operations", "Finance"];
const names = [
  "Aarav Mehta", "Priya Shah", "Rohan Kapoor", "Isha Verma", "Kabir Singh",
  "Ananya Rao", "Vivaan Joshi", "Diya Nair", "Arjun Reddy", "Meera Iyer",
  "Yash Patel", "Saanvi Gupta", "Neel Desai", "Tara Menon", "Dev Malhotra",
  "Kiara Bhatt", "Aditya Rao", "Zara Khan", "Aryan Sethi", "Naina Kapoor",
];

const seedEmployees: Employee[] = names.map((name, i) => ({
  id: `emp-${i + 1}`,
  name,
  email: name.toLowerCase().replace(/ /g, ".") + "@vibetechlabs.com",
  empId: `VTL-${String(i + 1).padStart(3, "0")}`,
  role: i === 0 ? "admin" : i < 4 ? "manager" : "employee",
  department: departments[i % departments.length],
  reportsTo: i < 1 ? "—" : names[Math.floor(i / 5)],
  joiningDate: daysAgo(30 + i * 20),
  faceStatus: i % 4 === 0 ? "pending" : "registered",
  status: i % 9 === 0 ? "inactive" : "active",
}));

const seedAttendance: AttendanceRow[] = seedEmployees.map((e, i) => ({
  id: `att-${i}`,
  empId: e.empId,
  name: e.name,
  department: e.department,
  date: iso(today),
  checkIn: i % 7 === 0 ? "—" : `${9 + (i % 2)}:${String(5 + (i * 7) % 55).padStart(2, "0")} AM`,
  checkOut: i % 7 === 0 ? "—" : i % 3 === 0 ? "—" : `${5 + (i % 3)}:${String((i * 11) % 55).padStart(2, "0")} PM`,
  hours: i % 7 === 0 ? 0 : 6 + ((i * 3) % 4) + Math.random(),
  status: i % 7 === 0 ? "Absent" : i % 5 === 0 ? "Late" : "Present",
}));

const seedLeaves: LeaveRequest[] = [
  { id: "lv-1", empId: "VTL-005", name: "Kabir Singh", type: "Casual", from: daysAgo(-3), to: daysAgo(-5), days: 3, reason: "Family function", status: "Pending", appliedOn: daysAgo(1) },
  { id: "lv-2", empId: "VTL-008", name: "Diya Nair", type: "Sick", from: daysAgo(2), to: daysAgo(1), days: 2, reason: "Fever & flu", status: "Approved", appliedOn: daysAgo(3) },
  { id: "lv-3", empId: "VTL-012", name: "Saanvi Gupta", type: "Earned", from: daysAgo(-10), to: daysAgo(-13), days: 4, reason: "Vacation to Goa", status: "Pending", appliedOn: daysAgo(0) },
  { id: "lv-4", empId: "VTL-042", name: "Rohan Kapoor", type: "Casual", from: daysAgo(5), to: daysAgo(5), days: 1, reason: "Personal errand", status: "Rejected", appliedOn: daysAgo(7) },
  { id: "lv-5", empId: "VTL-015", name: "Dev Malhotra", type: "Sick", from: daysAgo(-1), to: daysAgo(-2), days: 2, reason: "Migraine", status: "Pending", appliedOn: daysAgo(0) },
  { id: "lv-6", empId: "VTL-042", name: "Rohan Kapoor", type: "Regularization", from: daysAgo(1), to: daysAgo(1), days: 1, reason: "Forgot to check out yesterday, biometric issue.", status: "Pending", appliedOn: daysAgo(0) },
  { id: "lv-7", empId: "VTL-042", name: "Rohan Kapoor", type: "Regularization", from: daysAgo(14), to: daysAgo(14), days: 1, reason: "Check-in missed due to field visit.", status: "Approved", appliedOn: daysAgo(13) },
];

const seedUpdates: DailyUpdate[] = seedEmployees.slice(0, 8).map((e, i) => ({
  id: `up-${i}`,
  empId: e.empId,
  name: e.name,
  role: e.role,
  text: [
    "Shipped the new onboarding flow 🚀 3 tickets closed.",
    "Reviewed 4 PRs and paired with @Diya on the billing module.",
    "Wrapped up Q2 design tokens. Dark mode polish next.",
    "Met 3 new leads today. 2 qualified for demo.",
    "Fixed critical bug in attendance sync service.",
    "Drafted the new employee handbook. HR review Monday.",
    "Ran load tests — P95 latency down 18%.",
    "Finalized campaign creatives for the launch.",
  ][i],
  timestamp: new Date(Date.now() - i * 1000 * 60 * 47).toISOString(),
}));

const seedAudit: AuditLog[] = Array.from({ length: 14 }).map((_, i) => {
  const e = seedEmployees[i % seedEmployees.length];
  const isFailed = i % 9 === 0;
  const actions = ["auth.login", "auth.logout", "leave.create", "user.update", "settings.update", "attendance.checkin", "auth.login_failed"];
  return {
    id: `log-${i}`,
    timestamp: new Date(Date.now() - i * 1000 * 60 * 23).toISOString(),
    user: e.name,
    userId: e.id,
    role: e.role === "admin" ? "SADM" : e.role === "manager" ? "MGR" : "EMP",
    action: actions[i % actions.length],
    resource: actions[i % actions.length].startsWith("auth") ? `user (${e.id})` : "system",
    ip: `192.168.${(i * 7) % 255}.${(i * 13) % 255}`,
    status: isFailed ? "Failed" : "Success",
  };
});

const seedNotifications: AppNotification[] = [
  // dummy notifications removed; notifications now come from backend
];

export const useDataStore = create<DataState>((set) => ({
  employees: [],
  attendance: [],
  leaves: [],
  updates: [],
  audit: [],
  notifications: [],
  addEmployee: (e) =>
    set((s) => ({ employees: [{ ...e, id: `emp-${Date.now()}` }, ...s.employees] })),
  updateEmployee: (id, patch) =>
    set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
  deleteEmployee: (id) =>
    set((s) => ({ employees: s.employees.filter((e) => e.id !== id) })),
  addLeave: (l) =>
    set((s) => ({
      leaves: [
        { ...l, id: `lv-${Date.now()}`, status: "Pending", appliedOn: iso(new Date()) },
        ...s.leaves,
      ],
    })),
  setLeaveStatus: (id, status) =>
    set((s) => ({ leaves: s.leaves.map((l) => (l.id === id ? { ...l, status } : l)) })),
  addUpdate: (u) =>
    set((s) => ({
      updates: [{ ...u, id: `up-${Date.now()}`, timestamp: new Date().toISOString() }, ...s.updates],
    })),
  forceCheckout: (id) =>
    set((s) => ({
      attendance: s.attendance.map((a) =>
        a.id === id ? { ...a, checkOut: "6:00 PM (forced)", hours: 8 } : a
      ),
    })),
  markNotificationsRead: () =>
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
  addNotification: (n) =>
    set((s) => ({
      notifications: [
        {
          id: `n-${Date.now()}`,
          title: n.title,
          body: n.body,
          type: n.type,
          read: false,
          time: n.time || "just now",
        },
        ...s.notifications,
      ],
    })),
  setEmployeesFromApi: (items) =>
    set(() => ({
      employees: items.map((item) => {
        const mapRole = (r: string): Employee["role"] => {
          if (r === "manager") return "manager";
          if (r === "employee") return "employee";
          if (r === "hr") return "hr";
          if (r === "sales") return "sales";
          return "admin";
        };
        const primary = mapRole(item.role);
        const roles = (item.roles?.length ? item.roles : [item.role]).map(mapRole);
        return {
        id: String(item.id),
        userId: item.userId ? String(item.userId) : undefined,
        name: item.name,
        email: item.email,
        empId: item.empId,
        role: primary,
        roles: [...new Set(roles)],
        department: item.department || "General",
        managerUserId: item.managerUserId ? String(item.managerUserId) : undefined,
        managerEmployeeId: item.managerEmployeeId ? String(item.managerEmployeeId) : undefined,
        managerEmployeeIds: (item.managerEmployeeIds?.length
          ? item.managerEmployeeIds
          : item.managerEmployeeId
            ? [item.managerEmployeeId]
            : []
        ).map(String),
        reportsTo: item.reportsTo || "—",
        joiningDate: item.joiningDate || iso(new Date()),
        faceStatus: item.faceStatus || "pending",
        avatar: item.avatar || undefined,
        status: item.status || "active",
        hasEmployeeProfile: item.hasEmployeeProfile ?? true,
        isWfh: Boolean(item.isWfh),
        };
      }),
    })),
}));
