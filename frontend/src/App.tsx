import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SplashScreen } from "@/components/SplashScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { safeGetItem } from "@/utils/storageSafe";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Preferences from "./pages/Preferences";

import DashboardLayout from "./layouts/DashboardLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuthStore, userHasRole } from "./store/authStore";

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

// Recruitment pages
import JobsList from "./pages/recruitment/JobsList";
import JobCreate from "./pages/recruitment/JobCreate";
import JobEdit from "./pages/recruitment/JobEdit";
import JobPipeline from "./pages/recruitment/JobPipeline";
import CandidatesList from "./pages/recruitment/CandidatesList";

// Performance pages
import CyclesList from "./pages/performance/CyclesList";
import GoalsBoard from "./pages/performance/GoalsBoard";
import MyAppraisal from "./pages/performance/MyAppraisal";
import TeamAppraisals from "./pages/performance/TeamAppraisals";

// ESS pages
import ProfileChangeRequests from "./pages/ess/ProfileChangeRequests";
import AdminChangeRequests from "./pages/ess/AdminChangeRequests";
import TicketsList from "./pages/ess/TicketsList";
import TicketDetail from "./pages/ess/TicketDetail";

// Documents pages
import PoliciesList from "./pages/documents/PoliciesList";
import LetterTemplates from "./pages/documents/LetterTemplates";
import LetterGenerate from "./pages/documents/LetterGenerate";
import LetterHistory from "./pages/documents/LetterHistory";

// Training pages
import TrainingList from "./pages/training/TrainingList";
import TrainingDetail from "./pages/training/TrainingDetail";
import TrainingAdmin from "./pages/training/TrainingAdmin";

import TaskManagement from "./pages/tasks/TaskManagement";

// Exit Management pages
import ResignationPage from "./pages/exit/ResignationPage";
import ClearanceChecklist from "./pages/exit/ClearanceChecklist";
import ExitInterviewPage from "./pages/exit/ExitInterviewPage";
import ExitAdminPage from "./pages/exit/ExitAdminPage";

// Payroll pages
import PayslipsList from "./pages/payroll/PayslipsList";
import SalaryStructurePage from "./pages/payroll/SalaryStructurePage";


const queryClient = new QueryClient();

const RoleBasedAdminDashboard = () => {
  const { user } = useAuthStore();
  return user && userHasRole(user, "manager") && !userHasRole(user, "admin")
    ? <ManagerDashboard />
    : <AdminDashboard />;
};

const App = () => {
  useEffect(() => {
    const stored = safeGetItem(localStorage, "vtl-theme");
    const dark = stored ? stored === "dark" : true;
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-right" richColors />
        <ErrorBoundary>
        <SplashScreen>
          <BrowserRouter future={{ v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />

              {/* Admin/Manager/HR shared routes */}
              <Route element={<ProtectedRoute allow={["admin", "manager", "hr"]} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/admin/attendance" element={<AttendanceManagement />} />
                  <Route path="/admin/change-requests" element={<AdminChangeRequests />} />
                  <Route path="/recruitment/jobs" element={<JobsList />} />
                  <Route path="/recruitment/jobs/new" element={<JobCreate />} />
                  <Route path="/recruitment/jobs/:id/edit" element={<JobEdit />} />
                  <Route path="/recruitment/jobs/:id/pipeline" element={<JobPipeline />} />
                  <Route path="/recruitment/openings" element={<JobsList />} />
                  <Route path="/recruitment/openings/new" element={<JobCreate />} />
                  <Route path="/recruitment/openings/:id/edit" element={<JobEdit />} />
                  <Route path="/recruitment/openings/:id/pipeline" element={<JobPipeline />} />
                  <Route path="/recruitment/candidates" element={<CandidatesList />} />
                  <Route path="/performance/cycles" element={<CyclesList />} />
                  <Route path="/performance/goals" element={<GoalsBoard />} />
                  <Route path="/performance/team" element={<TeamAppraisals />} />
                  <Route path="/letters/templates" element={<LetterTemplates />} />
                  <Route path="/letters/generate" element={<LetterGenerate />} />
                  <Route path="/letters/history" element={<LetterHistory />} />
                  <Route path="/training/admin" element={<TrainingAdmin />} />
                  <Route path="/exit/admin" element={<ExitAdminPage />} />
                  <Route path="/exit/clearance/:resignationId" element={<ClearanceChecklist />} />
                  <Route path="/exit/interview/:resignationId" element={<ExitInterviewPage />} />
                  <Route path="/payroll/salary-structures" element={<SalaryStructurePage />} />
                </Route>
              </Route>

              {/* Admin & Manager shared routes (HR excluded) */}
              <Route element={<ProtectedRoute allow={["admin", "manager"]} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/admin" element={<RoleBasedAdminDashboard />} />
                </Route>
              </Route>

              {/* Admin only (HR excluded from these pages) */}
              <Route element={<ProtectedRoute allow={["admin"]} />}>
                <Route element={<DashboardLayout />}>
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

              {/* General Employee / All Roles pages */}
              <Route element={<ProtectedRoute allow={["employee", "manager", "admin", "hr", "sales"]} />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/dashboard" element={<Navigate to="/employee" replace />} />
                  <Route path="/tasks" element={<TaskManagement />} />
                  <Route path="/employee" element={<EmployeeDashboard />} />

                  <Route path="/employee/attendance" element={<EmployeeAttendance />} />
                  <Route path="/employee/updates" element={<EmployeeUpdates />} />
                  <Route path="/employee/leaves" element={<EmployeeLeaves />} />
                  <Route path="/employee/approvals" element={<EmployeeApprovals />} />
                  <Route path="/my-profile/change-requests" element={<ProfileChangeRequests />} />
                  <Route path="/tickets" element={<TicketsList />} />
                  <Route path="/tickets/:id" element={<TicketDetail />} />
                  <Route path="/policies" element={<PoliciesList />} />
                  <Route path="/payroll/slips" element={<PayslipsList />} />
                  <Route path="/training" element={<TrainingList />} />
                  <Route path="/training/:id" element={<TrainingDetail />} />
                  <Route path="/resignation" element={<ResignationPage />} />
                  <Route path="/performance/my-appraisal" element={<MyAppraisal />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/preferences" element={<Preferences />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </SplashScreen>
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
