// src/pages/recruitment/JobsList.tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Briefcase, Building, MapPin, LayoutGrid } from "lucide-react";
import { fetchJobOpenings } from "@/api/recruitment";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill } from "@/components/StatusPill";

export default function JobsList() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => fetchJobOpenings().then((res) => res.data),
  });

  const jobsList = Array.isArray(data) ? data : data?.results || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            Job Openings
          </h1>
          <p className="text-sm text-muted-foreground">Manage active job postings, requirements, and hiring pipelines.</p>
        </div>
        <Button onClick={() => navigate("/recruitment/jobs/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Job Opening
        </Button>
      </div>

      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading job openings...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">Failed to load job openings.</div>
          ) : jobsList.length === 0 ? (
            <div className="py-12">
              <EmptyState title="No Job Openings" message="No job openings found. Click 'Create Job Opening' to create your first posting." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Experience</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobsList.map((job: any) => (
                  <TableRow key={job.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-medium text-foreground">
                      <div className="font-semibold">{job.title}</div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building className="h-3.5 w-3.5" />
                        {job.department || "N/A"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.location || "Remote"}
                      </span>
                    </TableCell>
                    <TableCell>{job.experience_required || "0-1 yrs"}</TableCell>
                    <TableCell>
                      <Badge variant={job.status === "open" ? "default" : job.status === "paused" ? "secondary" : "outline"}>
                        {job.status || "open"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => navigate(`/recruitment/jobs/${job.id}/pipeline`)}
                        >
                          <LayoutGrid className="h-3.5 w-3.5" />
                          Pipeline
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/recruitment/jobs/${job.id}/edit`)}>
                          Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
