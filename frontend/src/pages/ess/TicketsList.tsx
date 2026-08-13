// src/pages/ess/TicketsList.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { HelpCircle, Plus, MessageSquare, Paperclip, UserCheck, Shield } from "lucide-react";
import { fetchTickets, createTicket } from "@/api/ess";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";

export default function TicketsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState(false);
  const [form, setForm] = useState({
    category: "payroll",
    subject: "",
    description: "",
    priority: "medium",
  });
  const [attachment, setAttachment] = useState<File | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["tickets"],
    queryFn: () => fetchTickets().then((res) => res.data),
  });

  const tickets = Array.isArray(data) ? data : data?.results || [];

  const mutation = useMutation({
    mutationFn: (formData: FormData) => createTicket(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("HR Helpdesk ticket created successfully");
      setOpenModal(false);
      setForm({ category: "Payroll", subject: "", description: "", priority: "medium" });
      setAttachment(null);
    },
    onError: (err: any) => {
      const data = err?.response?.data;
      let msg = "Failed to create ticket";
      if (typeof data === "string") {
        msg = data;
      } else if (data && typeof data === "object") {
        msg = Object.entries(data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
      }
      toast.error(msg);
    },
  });


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("category", form.category);
    formData.append("subject", form.subject);
    formData.append("description", form.description);
    formData.append("priority", form.priority);
    if (attachment) {
      formData.append("attachment", attachment);
    }
    mutation.mutate(formData as any);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-primary" />
            HR Support & Tickets
          </h1>
          <p className="text-sm text-muted-foreground">
            Submit inquiries, payroll questions, or policy requests to the HR team.
          </p>
        </div>
        <Button onClick={() => setOpenModal(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Ticket
        </Button>
      </div>

      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading support tickets...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">Failed to load support tickets.</div>
          ) : tickets.length === 0 ? (
            <div className="py-12">
              <EmptyState title="No Tickets Found" message="You have no open or resolved support tickets. Click 'Create Ticket' to raise an inquiry." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket Subject</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t: any) => (
                  <TableRow key={t.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        <span>{t.subject}</span>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize text-sm">{t.category?.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Badge variant={t.priority === "high" ? "destructive" : t.priority === "medium" ? "secondary" : "outline"}>
                        {t.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.assigned_to_name || t.assigned_to?.name || "Unassigned"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === "resolved" ? "default" : t.status === "in_progress" ? "secondary" : "outline"} className="capitalize">
                        {t.status?.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/tickets/${t.id}`)}>
                        View Ticket
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Support Ticket</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="t-subject">Subject</Label>
              <Input
                id="t-subject"
                required
                placeholder="Brief summary of your inquiry"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="t-category">Category</Label>
                <Select value={form.category} onValueChange={(val) => setForm({ ...form, category: val })}>
                  <SelectTrigger id="t-category">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Payroll">Payroll / Salary</SelectItem>
                    <SelectItem value="Attendance">Attendance / Leaves</SelectItem>
                    <SelectItem value="IT">IT Support & Equipment</SelectItem>
                    <SelectItem value="Policy">Policy / HR General</SelectItem>
                    <SelectItem value="Facilities">Facilities</SelectItem>
                    <SelectItem value="Grievance">Grievance</SelectItem>
                    <SelectItem value="General">General Inquiry</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>

                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-priority">Priority</Label>
                <Select value={form.priority} onValueChange={(val) => setForm({ ...form, priority: val })}>
                  <SelectTrigger id="t-priority">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-desc">Detailed Description</Label>
              <Textarea
                id="t-desc"
                required
                rows={4}
                placeholder="Explain the background, context, or specific request..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-attach">Attachment (Optional)</Label>
              <Input
                id="t-attach"
                type="file"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isLoading}>
                {mutation.isLoading ? "Submitting..." : "Submit Ticket"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
