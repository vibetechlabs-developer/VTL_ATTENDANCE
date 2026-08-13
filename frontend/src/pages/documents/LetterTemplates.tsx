// src/pages/documents/LetterTemplates.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileCode, Plus, Eye, Code } from "lucide-react";
import { fetchLetterTemplates, createLetterTemplate, seedLetterTemplates } from "@/api/documents";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export default function LetterTemplates() {
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    subject_template: "",
    body_template: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["letter-templates"],
    queryFn: () => fetchLetterTemplates().then((res) => res.data),
  });

  const templates = Array.isArray(data) ? data : data?.results || [];

  const seedMutation = useMutation({
    mutationFn: () => seedLetterTemplates(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["letter-templates"] });
      toast.success("Standard MNC Letter Templates loaded successfully!");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to load MNC templates");
    },
  });

  const mutation = useMutation({
    mutationFn: (payload: typeof form) => createLetterTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["letter-templates"] });
      toast.success("Letter template created successfully");
      setOpenModal(false);
      setForm({ name: "", subject_template: "", body_template: "" });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to create letter template");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileCode className="h-6 w-6 text-primary" />
            Letter Templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage reusable templates for offer letters, experience certificates, and promotion letters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="gap-2 border-emerald-600/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
          >
            <Sparkles className="h-4 w-4 text-emerald-500" />
            {seedMutation.isPending ? "Loading..." : "Load Standard MNC Templates"}
          </Button>
          <Button onClick={() => setOpenModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Template
          </Button>
        </div>
      </div>

      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading templates...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">Failed to load letter templates.</div>
          ) : templates.length === 0 ? (
            <div className="py-12">
              <EmptyState title="No Templates Found" message="No letter templates registered yet. Click 'Create Template' to define a new template." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template Name</TableHead>
                  <TableHead>Subject Template</TableHead>
                  <TableHead>Created Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl: any) => (
                  <TableRow key={tpl.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-semibold text-foreground">{tpl.name}</TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">{tpl.subject_template || "N/A"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tpl.created_at
                        ? new Date(tpl.created_at).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "N/A"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create Letter Template</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="lt-name">Template Name</Label>
              <Input
                id="lt-name"
                required
                placeholder="e.g. Standard Employment Offer Letter"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lt-subject">Subject Line Template</Label>
              <Input
                id="lt-subject"
                placeholder="e.g. Offer of Employment - {{employee.name}}"
                value={form.subject_template}
                onChange={(e) => setForm({ ...form, subject_template: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="lt-body">Body Template</Label>
                <span className="text-[11px] text-muted-foreground">
                  Placeholders: <code className="bg-muted px-1 rounded">{`{{employee.name}}`}</code>, <code className="bg-muted px-1 rounded">{`{{employee.designation}}`}</code>
                </span>
              </div>
              <Textarea
                id="lt-body"
                required
                rows={8}
                placeholder="Dear {{employee.name}}, We are pleased to offer you the position of {{employee.designation}} in {{employee.department}}..."
                value={form.body_template}
                onChange={(e) => setForm({ ...form, body_template: e.target.value })}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save Template"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
