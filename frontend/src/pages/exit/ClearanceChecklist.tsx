// src/pages/exit/ClearanceChecklist.tsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardCheck, CheckCircle2, Clock, Building } from "lucide-react";
import { fetchClearanceItems, markClearanceDone, fetchResignationDetail } from "@/api/exitManagement";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

export default function ClearanceChecklist() {
  const { resignationId } = useParams<{ resignationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [remarks, setRemarks] = useState<Record<number, string>>({});

  const { data: resignationData } = useQuery({
    queryKey: ["resignation", resignationId],
    queryFn: () => fetchResignationDetail(resignationId!).then((res) => res.data),
    enabled: !!resignationId,
  });

  const { data: itemsData, isLoading, error } = useQuery({
    queryKey: ["clearance-items", resignationId],
    queryFn: () => fetchClearanceItems({ resignation: resignationId }).then((res) => res.data),
    enabled: !!resignationId,
  });

  const items = Array.isArray(itemsData) ? itemsData : itemsData?.results || [];

  // Group items by department
  const itemsByDept: Record<string, any[]> = {};
  items.forEach((item: any) => {
    const dept = item.department || "General";
    if (!itemsByDept[dept]) itemsByDept[dept] = [];
    itemsByDept[dept].push(item);
  });

  const doneCount = items.filter((i: any) => i.status === "done").length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const markDoneMutation = useMutation({
    mutationFn: ({ itemId, remark }: { itemId: number; remark: string }) => markClearanceDone(itemId, remark),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clearance-items", resignationId] });
      toast.success("Clearance item marked as done");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || "Failed to mark item as done");
    },
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading clearance checklist...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Failed to load clearance items.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate("/exit/admin")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Clearance Checklist
          </h1>
          <p className="text-sm text-muted-foreground">
            {resignationData ? `For: ${resignationData.employee_name || `Employee #${resignationData.employee}`}` : `Resignation #${resignationId}`}
          </p>
        </div>
      </div>

      {/* Progress Overview */}
      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-5">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-semibold text-foreground">Clearance Completion</div>
            <Badge variant={progress === 100 ? "default" : "outline"}>
              {doneCount} / {totalCount} done
            </Badge>
          </div>
          <Progress value={progress} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-2">{progress}% clearance completed</p>
        </CardContent>
      </Card>

      {/* Grouped by Department */}
      {Object.entries(itemsByDept).map(([dept, deptItems]) => (
        <Card key={dept} className="border border-border/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building className="h-4 w-4 text-muted-foreground" />
              {dept} Department
              <Badge variant="outline" className="ml-auto text-[11px]">
                {deptItems.filter((i: any) => i.status === "done").length} / {deptItems.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/40">
              {deptItems.map((item: any) => (
                <div key={item.id} className="flex items-start justify-between gap-4 px-6 py-4">
                  <div className="flex items-start gap-3 flex-1">
                    {item.status === "done" ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <Clock className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">{item.item_description}</div>
                      {item.status === "done" && item.remark && (
                        <div className="text-xs text-muted-foreground italic">Remark: {item.remark}</div>
                      )}
                      {item.status === "done" && item.cleared_by_name && (
                        <div className="text-xs text-muted-foreground">
                          Cleared by: {item.cleared_by_name} on {item.cleared_on?.slice(0, 10)}
                        </div>
                      )}
                    </div>
                  </div>

                  {item.status !== "done" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Input
                        className="h-8 text-xs w-40"
                        placeholder="Optional remark"
                        value={remarks[item.id] || ""}
                        onChange={(e) => setRemarks({ ...remarks, [item.id]: e.target.value })}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-emerald-600 hover:text-emerald-700 gap-1 text-xs shrink-0"
                        onClick={() => markDoneMutation.mutate({ itemId: item.id, remark: remarks[item.id] || "" })}
                        disabled={markDoneMutation.isPending || markDoneMutation.isLoading}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Done
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
