import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ManagerOption = {
  value: string;
  label: string;
};

type ManagerMultiSelectProps = {
  value: string[];
  onChange: (value: string[]) => void;
  options: ManagerOption[];
  placeholder?: string;
  className?: string;
};

export function ManagerMultiSelect({
  value,
  onChange,
  options,
  placeholder = "Select reporting managers",
  className,
}: ManagerMultiSelectProps) {
  const selected = new Set(value);
  const selectedLabels = options.filter((o) => selected.has(o.value)).map((o) => o.label.split(" (")[0]);

  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      onChange([...value, id]);
      return;
    }
    onChange(value.filter((v) => v !== id));
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
        <div className="max-h-56 overflow-y-auto space-y-1">
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2 py-1.5">No managers available</p>
          ) : (
            options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/60"
              >
                <Checkbox
                  checked={selected.has(opt.value)}
                  onCheckedChange={(c) => toggle(opt.value, c === true)}
                />
                <span className="truncate">{opt.label}</span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
