import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

export default function Index() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "employee" ? "/employee" : "/admin"} replace />;
}
