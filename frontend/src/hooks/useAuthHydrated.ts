import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";

/** Wait for persisted auth (localStorage) before routing — avoids iOS redirect/login flicker. */
export function useAuthHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  return hydrated;
}
