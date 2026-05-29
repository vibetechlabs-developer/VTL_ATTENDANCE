import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Role } from "@/store/authStore";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Super Admin" },
  { value: "manager", label: "Manager" },
  { value: "hr", label: "HR" },
  { value: "sales", label: "Sales" },
  { value: "employee", label: "Employee" },
];

type RoleMultiSelectProps = {
  value: Role[];
  onChange: (value: Role[]) => void;
  placeholder?: string;
  className?: string;
};

export function RoleMultiSelect({
  value,
  onChange,
  placeholder = "Select roles",
  className,
}: RoleMultiSelectProps) {
  const selected = new Set(value);
  const selectedLabels = ROLE_OPTIONS.filter((o) => selected.has(o.value)).map((o) => o.label);

  const toggle = (role: Role, checked: boolean) => {
    if (checked) {
      onChange([...value, role]);
      return;
    }
    const next = value.filter((v) => v !== role);
    onChange(next.length ? next : ["employee"]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-between font-normal h-10 px-3", className)}
        >
          <span className="truncate text-left">
            {selectedLabels.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selectedLabels.join(", ")
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <div className="space-y-1">
          {ROLE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/60"
            >
              <Checkbox
                checked={selected.has(opt.value)}
                onCheckedChange={(c) => toggle(opt.value, c === true)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function roleLabel(role: Role): string {
  const found = ROLE_OPTIONS.find((o) => o.value === role);
  return found?.label ?? role;
}

export function employeeRoles(e: { role: Role; roles?: Role[] }): Role[] {
  if (e.roles?.length) return e.roles;
  return [e.role];
}
