// src/pages/ess/ProfileChangeRequests.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCheck, Clock, CheckCircle2, XCircle, Plus, Edit, ShieldCheck } from "lucide-react";
import { fetchProfileChangeRequests, createProfileChangeRequest } from "@/api/ess";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/EmptyState";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuthStore, userHasRole } from "@/store/authStore";
import AdminChangeRequests from "./AdminChangeRequests";
import { toast } from "sonner";

export default function ProfileChangeRequests() {
  const { user } = useAuthStore();
  const isHrOrAdmin = userHasRole(user, "hr", "admin", "manager");
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState(false);
  const [fieldName, setFieldName] = useState("name");
  const [requestedValue, setRequestedValue] = useState("");
  const [activeTab, setActiveTab] = useState(isHrOrAdmin ? "queue" : "mine");

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-profile-changes"],
    queryFn: () => fetchProfileChangeRequests({ scope: "mine" }).then((res) => res.data),
  });

  const { data: pendingData } = useQuery({
    queryKey: ["admin-profile-changes"],
    queryFn: () => fetchProfileChangeRequests({ scope: "pending_review" }).then((res) => res.data),
    enabled: isHrOrAdmin,
  });

  const pendingRequests = Array.isArray(pendingData) ? pendingData : pendingData?.results || [];
  const pendingCount = pendingRequests.length;

  const mutation = useMutation({
    mutationFn: (payload: { field_name: string; requested_value: string }) =>
      createProfileChangeRequest(payload),
    onSuccess: () => {
      toast.success("Profile change request submitted to HR");
      setOpenModal(false);
      setRequestedValue("");
      queryClient.invalidateQueries({ queryKey: ["my-profile-changes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-profile-changes"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || "Failed to submit request");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestedValue.trim()) {
      toast.error("Requested value cannot be empty");
      return;
    }
    mutation.mutate({
      field_name: fieldName,
      requested_value: requestedValue.trim(),
    });
  };

  const requests = Array.isArray(data) ? data : data?.results || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-primary" />
            Profile Change Requests
          </h1>
          <p className="text-sm text-muted-foreground">
            Track and submit requests to update sensitive profile information (HR approval required).
          </p>
        </div>
        <Button onClick={() => setOpenModal(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Request Profile Change
        </Button>
      </div>

      {isHrOrAdmin ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="queue" className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              HR Approval Queue
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-[10px] rounded-full">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="mine" className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              My Submissions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue">
            <AdminChangeRequests />
          </TabsContent>

          <TabsContent value="mine">
            <Card className="border border-border/40 shadow-sm">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading request history...</div>
                ) : error ? (
                  <div className="p-8 text-center text-red-500">Failed to load profile change requests.</div>
                ) : requests.length === 0 ? (
                  <div className="py-12">
                    <EmptyState title="No Change Requests" message="You have not submitted any profile change requests yet. Click 'Request Profile Change' to submit an update." />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field Requested</TableHead>
                        <TableHead>Current Value</TableHead>
                        <TableHead>Requested Value</TableHead>
                        <TableHead>Date Submitted</TableHead>
                        <TableHead>Assigned HR</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.map((req: any) => (
                        <TableRow key={req.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="font-semibold text-foreground capitalize">
                            {req.field_name?.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">{req.old_value || "—"}</TableCell>
                          <TableCell className="font-mono text-xs text-foreground font-medium">{req.requested_value}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {req.requested_on ? req.requested_on.slice(0, 10) : "—"}
                          </TableCell>
                          <TableCell className="text-foreground font-medium">
                            {req.reviewed_by_name || "Assigned HR"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                req.status === "approved"
                                  ? "default"
                                  : req.status === "rejected"
                                  ? "destructive"
                                  : "outline"
                              }
                              className="gap-1 capitalize"
                            >
                              {req.status === "approved" && <CheckCircle2 className="h-3 w-3" />}
                              {req.status === "rejected" && <XCircle className="h-3 w-3" />}
                              {req.status === "pending" && <Clock className="h-3 w-3" />}
                              {req.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card className="border border-border/40 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading request history...</div>
            ) : error ? (
              <div className="p-8 text-center text-red-500">Failed to load profile change requests.</div>
            ) : requests.length === 0 ? (
              <div className="py-12">
                <EmptyState title="No Change Requests" message="You have not submitted any profile change requests yet. Click 'Request Profile Change' to submit an update." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field Requested</TableHead>
                    <TableHead>Current Value</TableHead>
                    <TableHead>Requested Value</TableHead>
                    <TableHead>Date Submitted</TableHead>
                    <TableHead>Assigned HR</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req: any) => (
                    <TableRow key={req.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-semibold text-foreground capitalize">
                        {req.field_name?.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{req.old_value || "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground font-medium">{req.requested_value}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {req.requested_on ? req.requested_on.slice(0, 10) : "—"}
                      </TableCell>
                      <TableCell className="text-foreground font-medium">
                        {req.reviewed_by_name || "Assigned HR"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            req.status === "approved"
                              ? "default"
                              : req.status === "rejected"
                              ? "destructive"
                              : "outline"
                          }
                          className="gap-1 capitalize"
                        >
                          {req.status === "approved" && <CheckCircle2 className="h-3 w-3" />}
                          {req.status === "rejected" && <XCircle className="h-3 w-3" />}
                          {req.status === "pending" && <Clock className="h-3 w-3" />}
                          {req.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Request Profile Change Modal */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-primary" /> Request Profile Change
            </DialogTitle>
            <DialogDescription>
              Submit a requested change for your employee record. HR will review and approve it.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Field to Change</Label>
              <Select value={fieldName} onValueChange={setFieldName}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Field" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Full Name</SelectItem>
                  <SelectItem value="phone">Phone Number</SelectItem>
                  <SelectItem value="designation">Designation / Title</SelectItem>
                  <SelectItem value="address">Address</SelectItem>
                  <SelectItem value="bank_account_number">Bank Account Number</SelectItem>
                  <SelectItem value="bank_name">Bank Name</SelectItem>
                  <SelectItem value="ifsc_code">IFSC Code</SelectItem>
                  <SelectItem value="pan_number">PAN Card Number</SelectItem>
                  <SelectItem value="aadhaar_number">Aadhaar Card Number</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Requested New Value *</Label>
              <Input
                required
                placeholder="Enter the new value you want updated..."
                value={requestedValue}
                onChange={(e) => setRequestedValue(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
