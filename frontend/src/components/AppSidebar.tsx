import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Clock, CalendarDays, MessageSquare,
  ShieldCheck, FileClock, LogOut, CheckCircle2, BarChart3,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

const adminNav = [
  {
    group: "Overview", items: [
      { title: "Dashboard", url: "/admin", icon: LayoutDashboard, end: true },
    ]
  },
  {
    group: "Workforce", items: [
      { title: "User Management", url: "/admin/users", icon: Users },
      { title: "Attendance", url: "/admin/attendance", icon: Clock },
      { title: "Leaves", url: "/admin/leaves", icon: CalendarDays },
      { title: "Leave Usage", url: "/admin/leave-usage", icon: BarChart3 },
      { title: "Daily Updates", url: "/admin/updates", icon: MessageSquare },
    ]
  },
  {
    group: "System", items: [
      { title: "Audit Logs", url: "/admin/audit", icon: FileClock },
      { title: "Security", url: "/admin/security", icon: ShieldCheck },
    ]
  },
];

const managerNav = [
  {
    group: "Overview", items: [
      { title: "Dashboard", url: "/admin", icon: LayoutDashboard, end: true },
    ]
  },
  {
    group: "Team", items: [
      { title: "Attendance", url: "/admin/attendance", icon: Clock },
      { title: "Leaves", url: "/admin/leaves", icon: CalendarDays },
      { title: "Daily Updates", url: "/admin/updates", icon: MessageSquare },
    ]
  },
  {
    group: "Personal", items: [
      { title: "My Attendance", url: "/employee/attendance", icon: Clock },
      { title: "My Leaves", url: "/employee/leaves", icon: CalendarDays },
    ]
  },
];

const hrNav = [
  {
    group: "Overview", items: [
      { title: "Dashboard", url: "/admin", icon: LayoutDashboard, end: true },
    ]
  },
  {
    group: "HR Operations", items: [
      { title: "Attendance", url: "/admin/attendance", icon: Clock },
      { title: "Leaves", url: "/admin/leaves", icon: CalendarDays },
      { title: "Leave Usage", url: "/admin/leave-usage", icon: BarChart3 },
      { title: "Daily Updates", url: "/admin/updates", icon: MessageSquare },
    ]
  },
  {
    group: "Personal", items: [
      { title: "My Attendance", url: "/employee/attendance", icon: Clock },
      { title: "My Leaves", url: "/employee/leaves", icon: CalendarDays },
    ]
  },
];

const employeeNav = [
  {
    group: "You", items: [
      { title: "Dashboard", url: "/employee", icon: LayoutDashboard, end: true },
      { title: "Attendance", url: "/employee/attendance", icon: Clock },
      { title: "Daily Updates", url: "/employee/updates", icon: MessageSquare },
    ]
  },
  {
    group: "Requests", items: [
      { title: "Leaves", url: "/employee/leaves", icon: CalendarDays },
      { title: "Approvals", url: "/employee/approvals", icon: CheckCircle2 },
    ]
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };
  const nav =
    user?.role === "employee"
      ? employeeNav
      : user?.role === "manager"
        ? managerNav
        : user?.role === "hr"
          ? hrNav
          : adminNav;

  const isActive = (url: string, end?: boolean) =>
    end ? pathname === url : pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon" className="border-r border-border/40 bg-sidebar/60 backdrop-blur-xl border-glow-shine-right">
      <SidebarHeader className="border-b border-border/40 h-14 flex items-center justify-center px-3 shrink-0">
        <Logo collapsed={collapsed} />
      </SidebarHeader>

      <SidebarContent className="gap-0 px-2 py-2 scrollbar-hide">
        {nav.map((section) => (
          <SidebarGroup key={section.group}>
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground px-2 mb-1">
                {section.group}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = isActive(item.url, item.end);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}
                        className={cn(
                          "h-10 rounded-lg transition-smooth text-sidebar-foreground relative group-data-[collapsible=icon]:!p-0",
                          active && "bg-gradient-primary !text-white font-medium shadow-md hover:bg-gradient-primary hover:!text-white",
                          active && "before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-r-full before:bg-white/60",
                          !active && "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:-translate-y-[1px]"
                        )}>
                        <NavLink to={item.url} end={item.end} className={cn("flex items-center gap-2", collapsed && "justify-center w-full h-full")}>
                          <div className={cn(
                            "rounded-full flex items-center justify-center shrink-0 transition-smooth",
                            collapsed ? "h-8 w-8" : "h-8 w-8",
                            active ? "bg-white/15" : "bg-muted/30"
                          )}>
                            <item.icon className="h-[16px] w-[16px]" />
                          </div>
                          {!collapsed && <span className="text-sm">{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 p-1 shrink-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => void handleLogout()} tooltip="Sign out" className="h-10 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10 transition-smooth group-data-[collapsible=icon]:!p-0">
              <div className={cn(
                "rounded-full flex items-center justify-center shrink-0 bg-destructive/10",
                collapsed ? "h-8 w-8 mx-auto" : "h-8 w-8"
              )}>
                <LogOut className="h-[16px] w-[16px]" />
              </div>
              {!collapsed && <span className="text-sm font-medium">Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
