import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { roleUsesEmployeePortal, useAuthStore, Role } from "@/store/authStore";

export function ProtectedRoute({ allow }: { allow?: Role[] }) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  if (!hydrated) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user || !accessToken) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(user.role)) {
    return <Navigate to={roleUsesEmployeePortal(user.role) ? "/employee" : "/admin"} replace />;
  }
  return <Outlet />;
}
