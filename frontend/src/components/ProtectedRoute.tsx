import { Navigate, Outlet } from "react-router-dom";
import { roleUsesEmployeePortal, useAuthStore, Role } from "@/store/authStore";

export function ProtectedRoute({ allow }: { allow?: Role[] }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(user.role)) {
    return <Navigate to={roleUsesEmployeePortal(user.role) ? "/employee" : "/admin"} replace />;
  }
  return <Outlet />;
}
