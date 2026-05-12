import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuthStore } from "@/store/authStore";
import { usersListRequest } from "@/lib/api";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  ClipboardList,
  Shield,
  UserCircle,
  Plane,
  Clock,
  MessageSquare,
  Search,
} from "lucide-react";

type EmpRow = { id: number; name: string; email: string };

export function GlobalCommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  const [employees, setEmployees] = useState<EmpRow[]>([]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (!open || !accessToken) return;
    if (role !== "admin" && role !== "hr" && role !== "manager") return;
    let cancelled = false;
    void usersListRequest(accessToken).then(async (res) => {
      if (!res.ok || cancelled) return;
      const body = (await res.json().catch(() => [])) as any[];
      if (!Array.isArray(body) || cancelled) return;
      setEmployees(
        body.map((r) => ({
          id: r.id,
          name: String(r.name ?? ""),
          email: String(r.email ?? ""),
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, accessToken, role]);

  const go = useCallback(
    (path: string) => {
      setOpen(false);
      navigate(path);
    },
    [navigate]
  );

  const isAdmin = role === "admin";
  const isHR = role === "hr";
  const isManager = role === "manager";

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, people, or jump somewhere…" />
      <CommandList>
        <CommandEmpty>No matches. Try another keyword.</CommandEmpty>

        <CommandGroup heading="Navigate">
          {(isAdmin || isManager) && (
            <CommandItem onSelect={() => go("/admin")}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Admin dashboard
            </CommandItem>
          )}
          {isHR && (
            <CommandItem onSelect={() => go("/employee")}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              My dashboard
            </CommandItem>
          )}
          {(isAdmin || isHR || isManager) && (
            <CommandItem onSelect={() => go("/admin/attendance")}>
              <CalendarCheck className="mr-2 h-4 w-4" />
              Team attendance
            </CommandItem>
          )}
          {isAdmin && (
            <>
              <CommandItem onSelect={() => go("/admin/users")}>
                <Users className="mr-2 h-4 w-4" />
                User management
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/leaves")}>
                <Plane className="mr-2 h-4 w-4" />
                Leave approvals
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/updates")}>
                <ClipboardList className="mr-2 h-4 w-4" />
                Daily updates
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/audit")}>
                <Shield className="mr-2 h-4 w-4" />
                Audit logs
              </CommandItem>
            </>
          )}
          <CommandItem onSelect={() => go("/employee")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Employee home
          </CommandItem>
          <CommandItem onSelect={() => go("/employee/attendance")}>
            <Clock className="mr-2 h-4 w-4" />
            My attendance
          </CommandItem>
          <CommandItem onSelect={() => go("/employee/leaves")}>
            <Plane className="mr-2 h-4 w-4" />
            My leaves
          </CommandItem>
          <CommandItem onSelect={() => go("/employee/updates")}>
            <MessageSquare className="mr-2 h-4 w-4" />
            My updates
          </CommandItem>
          <CommandItem onSelect={() => go("/profile")}>
            <UserCircle className="mr-2 h-4 w-4" />
            Profile
          </CommandItem>
        </CommandGroup>

        {(isAdmin || isHR || isManager) && employees.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="People">
              {employees.slice(0, 40).map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.name} ${e.email}`}
                  onSelect={() => go(isAdmin ? "/admin/users" : "/admin/attendance")}
                >
                  <Search className="mr-2 h-4 w-4 opacity-60" />
                  <span className="truncate">{e.name}</span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">{e.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
