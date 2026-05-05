import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore, Role } from "@/store/authStore";

export function ProtectedRoute({ allow }: { allow?: Role[] }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(user.role)) {
    return <Navigate to={user.role === "employee" ? "/employee" : "/admin"} replace />;
  }
  return <Outlet />;
}
