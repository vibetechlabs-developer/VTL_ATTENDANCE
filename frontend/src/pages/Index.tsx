import { Navigate } from "react-router-dom";
import { roleUsesEmployeePortal, useAuthStore } from "@/store/authStore";

export default function Index() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={roleUsesEmployeePortal(user.role) ? "/employee" : "/admin"} replace />;
}
