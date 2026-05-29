import { NavLink, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Users, Clock, CalendarDays, MessageSquare,
  ShieldCheck, FileClock, LogOut, CheckCircle2, BarChart3, PieChart,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { useAuthStore, userHasRole } from "@/store/authStore";
import { cn } from "@/lib/utils";

/** External Enterprise CRM. */
export const EXTERNAL_VTL_CRM_URL = "https://vibetechlabs.com/crm/" as const;

type SidebarNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  end?: boolean;
  external?: boolean;
};

type SidebarNavSection = { group: string; items: SidebarNavItem[] };

function appendCrmNav(sections: SidebarNavSection[]): SidebarNavSection[] {
  const crm: SidebarNavSection = {
    group: "Sales",
    items: [{ title: "CRM", url: EXTERNAL_VTL_CRM_URL, icon: BarChart3, external: true }],
  };
  return [...sections, crm];
}

const adminNav: SidebarNavSection[] = [
  {
    group: "Overview",
    items: [{ title: "Dashboard", url: "/admin", icon: LayoutDashboard, end: true }],
  },
  {
    group: "Workforce",
    items: [
      { title: "User Management", url: "/admin/users", icon: Users },
      { title: "Attendance", url: "/admin/attendance", icon: Clock },
      { title: "Leaves", url: "/admin/leaves", icon: CalendarDays },
      { title: "Leave Usage", url: "/admin/leave-usage", icon: PieChart },
      { title: "Daily Updates", url: "/admin/updates", icon: MessageSquare },
    ],
  },
  {
    group: "System",
    items: [
      { title: "Audit Logs", url: "/admin/audit", icon: FileClock },
      { title: "Security", url: "/admin/security", icon: ShieldCheck },
    ],
  },
];

const managerNav: SidebarNavSection[] = [
  {
    group: "Personal",
    items: [
      { title: "My Dashboard", url: "/employee", icon: LayoutDashboard, end: true },
      { title: "My Attendance", url: "/employee/attendance", icon: Clock },
      { title: "Daily Updates", url: "/employee/updates", icon: MessageSquare },
      { title: "My Leaves", url: "/employee/leaves", icon: CalendarDays },
      { title: "Approvals", url: "/employee/approvals", icon: CheckCircle2 },
    ],
  },
  {
    group: "Team",
    items: [{ title: "Team Attendance", url: "/admin/attendance", icon: Users }],
  },
];

const hrNav: SidebarNavSection[] = [
  {
    group: "Personal",
    items: [
      { title: "My Dashboard", url: "/employee", icon: LayoutDashboard, end: true },
      { title: "My Attendance", url: "/employee/attendance", icon: Clock },
      { title: "Daily Updates", url: "/employee/updates", icon: MessageSquare },
      { title: "My Leaves", url: "/employee/leaves", icon: CalendarDays },
      { title: "Approvals", url: "/employee/approvals", icon: CheckCircle2 },
    ],
  },
  {
    group: "Team",
    items: [{ title: "Team Attendance", url: "/admin/attendance", icon: Users }],
  },
];

const employeeNav: SidebarNavSection[] = [
  {
    group: "You",
    items: [
      { title: "Dashboard", url: "/employee", icon: LayoutDashboard, end: true },
      { title: "Attendance", url: "/employee/attendance", icon: Clock },
      { title: "Daily Updates", url: "/employee/updates", icon: MessageSquare },
    ],
  },
  {
    group: "Requests",
    items: [
      { title: "Leaves", url: "/employee/leaves", icon: CalendarDays },
      { title: "Approvals", url: "/employee/approvals", icon: CheckCircle2 },
    ],
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

  let nav: SidebarNavSection[];
  if (userHasRole(user, "admin")) {
    nav = appendCrmNav(adminNav);
  } else if (userHasRole(user, "manager")) {
    nav = managerNav;
  } else if (userHasRole(user, "hr")) {
    nav = appendCrmNav(hrNav);
  } else if (userHasRole(user, "sales")) {
    nav = appendCrmNav(employeeNav);
  } else {
    nav = employeeNav;
  }

  const isActive = (url: string, end?: boolean) =>
    end ? pathname === url : pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon" className="border-r border-border/30 bg-sidebar/60 backdrop-blur-xl">
      <SidebarHeader className="border-b border-border/40 h-16 flex items-center justify-center px-3 shrink-0">
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
                  const active = item.external ? false : isActive(item.url, item.end);
                  const rowClass = cn("flex items-center gap-2", collapsed && "justify-center w-full h-full");
                  const iconWrap = cn(
                    "rounded-full flex items-center justify-center shrink-0 transition-smooth",
                    collapsed ? "h-8 w-8" : "h-8 w-8",
                    active ? "bg-white/15" : "bg-muted/30"
                  );
                  const btnClass = cn(
                    "h-11 px-2 rounded-xl transition-smooth text-sidebar-foreground relative overflow-hidden group-data-[collapsible=icon]:!p-0 group hover:scale-[1.01] active:scale-[0.99] hover:shadow-glass hover-shine",
                    active &&
                      "bg-gradient-primary !text-white font-medium shadow-glow hover:bg-gradient-primary hover:!text-white before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-r-full before:bg-primary/70",
                    !active && "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:-translate-y-[1px]"
                  );
                  const inner = (
                    <>
                      <div className={iconWrap}>
                        <item.icon className="h-[16px] w-[16px]" />
                      </div>
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </>
                  );
                  return (
                    <SidebarMenuItem key={`${section.group}-${item.title}-${item.url}`}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title} className={btnClass}>
                        {item.external ? (
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className={rowClass}>
                            {inner}
                          </a>
                        ) : (
                          <NavLink to={item.url} end={item.end} className={rowClass}>
                            {inner}
                          </NavLink>
                        )}
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
