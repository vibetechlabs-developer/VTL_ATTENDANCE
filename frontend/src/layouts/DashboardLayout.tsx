import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { motion } from "framer-motion";

export default function DashboardLayout() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  const titleForSegment = (seg: string) => {
    if (seg === "admin") return "Admin";
    if (seg === "employee") return "Employee";
    if (seg === "leave-usage") return "Leave Usage";
    if (seg === "attendance") return "Attendance";
    if (seg === "daily-updates" || seg === "updates") return "Updates";
    if (seg === "audit") return "Audit Logs";
    if (seg === "security") return "Security";
    if (seg === "users") return "Users";
    if (seg === "leaves") return "Leaves";
    if (seg === "approvals") return "Approvals";
    if (seg === "profile") return "Profile";
    if (seg === "preferences") return "Preferences";
    return seg
      .split("-")
      .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
      .join(" ");
  };

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader />
          <div className="px-4 sm:px-6 lg:px-8 -mt-4 mb-4">
            <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
              <ol className="flex flex-wrap items-center gap-2">
                <li className="inline-flex items-center">
                  <span className="opacity-80">Home</span>
                </li>
                {segments.length === 0 ? null : (
                  <>
                    <li aria-hidden="true" className="opacity-60">
                      /
                    </li>
                    {segments.map((seg, idx) => (
                      <li key={`${seg}-${idx}`} className="inline-flex items-center gap-2">
                        {idx > 0 && (
                          <span aria-hidden="true" className="opacity-60">
                            /
                          </span>
                        )}
                        <span className={idx === segments.length - 1 ? "text-foreground font-medium" : "opacity-90"}>
                          {titleForSegment(seg)}
                        </span>
                      </li>
                    ))}
                  </>
                )}
              </ol>
            </nav>
          </div>
          <main className="flex-1 overflow-x-hidden">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="container max-w-none px-4 sm:px-6 lg:px-8 py-6"
            >
              <Outlet />
            </motion.div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
