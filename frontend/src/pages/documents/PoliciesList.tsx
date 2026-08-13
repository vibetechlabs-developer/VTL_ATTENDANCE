// src/pages/documents/PoliciesList.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Download, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { fetchPolicies, uploadPolicy, updatePolicy } from "@/api/documents";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { useAuthStore, userHasRole } from "@/store/authStore";
import { toast } from "sonner";

const POLICY_CATEGORIES = [
  "HR Policy",
  "IT Policy",
  "Code of Conduct",
  "Leave Policy",
  "Benefits",
  "Compliance",
  "General",
  "Other",
];

export default function PoliciesList() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [openModal, setOpenModal] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "HR Policy",
    description: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["policies"],
    queryFn: () => fetchPolicies().then((res) => res.data),
  });

  const policies = Array.isArray(data) ? data : data?.results || [];
  const isHR = userHasRole(user, "admin", "hr");

  const mutation = useMutation({
    mutationFn: (formData: FormData) => uploadPolicy(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success("Policy document published successfully");
      setOpenModal(false);
      setForm({ title: "", category: "HR Policy", description: "" });
      setFile(null);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.response?.data?.error || err?.response?.data?.non_field_errors?.[0] || "Failed to publish policy";
      toast.error(msg);
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      updatePolicy(id, { is_active }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success(variables.is_active ? "Policy marked as Active" : "Policy marked as Inactive");
    },
    onError: () => toast.error("Failed to update policy status"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Policy file attachment is required");
      return;
    }
    const formData = new FormData();
    formData.append("title", form.title);
    formData.append("category", form.category);
    formData.append("description", form.description);
    formData.append("file", file);
    formData.append("is_active", "true");
    mutation.mutate(formData as any);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Company Policies
          </h1>
          <p className="text-sm text-muted-foreground">
            Access official company handbook, code of conduct, leave policies, and IT guidelines.
          </p>
        </div>
        {isHR && (
          <Button onClick={() => setOpenModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Publish Policy
          </Button>
        )}
      </div>

      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading policies...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">Failed to load policy documents.</div>
          ) : policies.length === 0 ? (
            <div className="py-12">
              <EmptyState title="No Policies Published" message="No active company policy documents available." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Published On</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">{isHR ? "Actions" : "Download"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p: any) => (
                  <TableRow key={p.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-semibold text-foreground">
                      <div>{p.title}</div>
                      {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                    </TableCell>
                    <TableCell className="capitalize text-sm">{p.category || "General"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.published_on
                        ? new Date(p.published_on).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.is_active ? "default" : "secondary"}>
                        {p.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {p.file ? (
                          <a href={p.file} target="_blank" rel="noreferrer" download>
                            <Button variant="ghost" size="sm" className="gap-1 text-primary">
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </Button>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">No File</span>
                        )}
                        {isHR && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`gap-1 ${p.is_active ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-700"}`}
                            disabled={toggleStatusMutation.isPending}
                            onClick={() =>
                              toggleStatusMutation.mutate({ id: p.id, is_active: !p.is_active })
                            }
                          >
                            {p.is_active ? (
                              <><ToggleLeft className="h-3.5 w-3.5" /> Deactivate</>
                            ) : (
                              <><ToggleRight className="h-3.5 w-3.5" /> Activate</>
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish Policy Document</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="p-title">Policy Title</Label>
              <Input
                id="p-title"
                required
                placeholder="e.g. Remote Work & Security Policy 2026"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-cat">Category</Label>
              <Select value={form.category} onValueChange={(val) => setForm({ ...form, category: val })}>
                <SelectTrigger id="p-cat">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {POLICY_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-desc">Short Description</Label>
              <Textarea
                id="p-desc"
                rows={3}
                placeholder="Summary of terms or scope..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-file">Policy PDF / File</Label>
              <Input
                id="p-file"
                type="file"
                required
                accept=".pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Publishing..." : "Publish Policy"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
