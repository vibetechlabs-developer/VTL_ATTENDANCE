// src/pages/recruitment/CandidatesList.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Upload, Mail, Phone, FileText } from "lucide-react";
import { fetchCandidates, createCandidate } from "@/api/recruitment";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";

export default function CandidatesList() {
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["candidates"],
    queryFn: () => fetchCandidates().then((res) => res.data),
  });

  const candidateList = Array.isArray(data) ? data : data?.results || [];

  const mutation = useMutation({
    mutationFn: (formData: FormData) => createCandidate(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidate added successfully");
      setOpenModal(false);
      setForm({ name: "", email: "", phone: "" });
      setResumeFile(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to add candidate");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("name", form.name);
    formData.append("email", form.email);
    formData.append("phone", form.phone);
    if (resumeFile) {
      formData.append("resume", resumeFile);
    }
    mutation.mutate(formData as any);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Candidates Pool
          </h1>
          <p className="text-sm text-muted-foreground">Manage candidate profiles, contact information, and resume uploads.</p>
        </div>
        <Button onClick={() => setOpenModal(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Candidate
        </Button>
      </div>

      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading candidates...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">Failed to load candidate list.</div>
          ) : candidateList.length === 0 ? (
            <div className="py-12">
              <EmptyState title="No Candidates" message="No candidate profiles found. Click 'Add Candidate' to add candidate records." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Resume</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidateList.map((candidate: any) => (
                  <TableRow key={candidate.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-semibold text-foreground">{candidate.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        {candidate.email}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        {candidate.phone || "N/A"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {candidate.resume ? (
                        <a
                          href={candidate.resume}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary underline"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          View Resume
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">No file</span>
                      )}
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
            <DialogTitle>Add Candidate</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="c-name">Full Name</Label>
              <Input
                id="c-name"
                required
                placeholder="John Doe"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-email">Email Address</Label>
              <Input
                id="c-email"
                type="email"
                required
                placeholder="john.doe@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-phone">Phone Number</Label>
              <Input
                id="c-phone"
                placeholder="+1 234 567 890"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-resume">Resume File (PDF/Docx)</Label>
              <Input
                id="c-resume"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isLoading}>
                {mutation.isLoading ? "Saving..." : "Save Candidate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
