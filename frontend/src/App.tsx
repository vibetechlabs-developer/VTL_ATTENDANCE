import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SplashScreen } from "@/components/SplashScreen";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Preferences from "./pages/Preferences";

import DashboardLayout from "./layouts/DashboardLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuthStore } from "./store/authStore";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import UserManagement from "./pages/admin/UserManagement";
import AttendanceManagement from "./pages/admin/AttendanceManagement";
import LeaveManagement from "./pages/admin/LeaveManagement";
import LeaveUsageOverview from "./pages/admin/LeaveUsageOverview";
import DailyUpdatesFeed from "./pages/admin/DailyUpdatesFeed";
import AuditLogs from "./pages/admin/AuditLogs";
import SecurityPanel from "./pages/admin/SecurityPanel";
import ManagerDashboard from "./pages/admin/ManagerDashboard";

// Employee pages
import EmployeeDashboard from "./pages/employee/EmployeeDashboard";
import EmployeeAttendance from "./pages/employee/EmployeeAttendance";
import EmployeeUpdates from "./pages/employee/EmployeeUpdates";
import EmployeeLeaves from "./pages/employee/EmployeeLeaves";
import EmployeeApprovals from "./pages/employee/EmployeeApprovals";

const queryClient = new QueryClient();

const RoleBasedAdminDashboard = () => {
  const { user } = useAuthStore();
  return user?.role === "manager" ? <ManagerDashboard /> : <AdminDashboard />;
};

const App = () => {
  useEffect(() => {
    const stored = localStorage.getItem("vtl-theme");
    const dark = stored ? stored === "dark" : true;
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-right" richColors />
        <SplashScreen>
          <BrowserRouter future={{ v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />

              {/* Admin & Manager shared routes */}
              <Route element={<ProtectedRoute allow={["admin", "manager"]} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/admin" element={<RoleBasedAdminDashboard />} />
                  <Route path="/admin/attendance" element={<AttendanceManagement />} />
                  <Route path="/admin/leaves" element={<LeaveManagement />} />
                  <Route path="/admin/leave-usage" element={<LeaveUsageOverview />} />
                  <Route path="/admin/updates" element={<DailyUpdatesFeed />} />
                </Route>
              </Route>

              {/* Admin only */}
              <Route element={<ProtectedRoute allow={["admin"]} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/admin/users" element={<UserManagement />} />
                  <Route path="/admin/audit" element={<AuditLogs />} />
                  <Route path="/admin/security" element={<SecurityPanel />} />
                </Route>
              </Route>

              {/* Employee base pages (HR also allowed for check-in flow) */}
              <Route element={<ProtectedRoute allow={["employee", "manager", "admin", "hr"]} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/employee" element={<EmployeeDashboard />} />
                  <Route path="/employee/attendance" element={<EmployeeAttendance />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/preferences" element={<Preferences />} />
                </Route>
              </Route>

              {/* Employee extended pages (HR not allowed) */}
              <Route element={<ProtectedRoute allow={["employee", "manager", "admin"]} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/employee/updates" element={<EmployeeUpdates />} />
                  <Route path="/employee/leaves" element={<EmployeeLeaves />} />
                  <Route path="/employee/approvals" element={<EmployeeApprovals />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </SplashScreen>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
