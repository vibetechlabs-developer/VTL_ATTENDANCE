import { Navigate } from "react-router-dom";
import { roleUsesEmployeePortal, useAuthStore } from "@/store/authStore";
import { useAuthHydrated } from "@/hooks/useAuthHydrated";

export default function Index() {
  const hydrated = useAuthHydrated();
  const user = useAuthStore((s) => s.user);

  if (!hydrated) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={roleUsesEmployeePortal(user.role) ? "/employee" : "/admin"} replace />;
}
