// src/pages/documents/LetterGenerate.tsx
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Send, Eye, RefreshCw } from "lucide-react";
import { fetchLetterTemplates, generateLetter } from "@/api/documents";
import { fetchEmployees } from "@/api/employees";
import axios from "@/api/axios";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MncLetterDocument } from "@/components/documents/MncLetterDocument";

export default function LetterGenerate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");

  const { data: templatesData } = useQuery({
    queryKey: ["letter-templates"],
    queryFn: () => fetchLetterTemplates().then((res) => res.data),
  });

  const { data: employeesData } = useQuery({
    queryKey: ["employees-list"],
    queryFn: () => fetchEmployees().then((res) => res.data),
  });

  const templatesList = Array.isArray(templatesData) ? templatesData : templatesData?.results || [];
  const employeesList = Array.isArray(employeesData) ? employeesData : employeesData?.results || [];

  const selectedTemplate = useMemo(() => {
    return templatesList.find((t: any) => String(t.id) === selectedTemplateId);
  }, [templatesList, selectedTemplateId]);

  const selectedEmployee = useMemo(() => {
    return employeesList.find((e: any) => String(e.id) === selectedEmployeeId);
  }, [employeesList, selectedEmployeeId]);

  const previewContent = useMemo(() => {
    if (!selectedTemplate || !selectedEmployee) return "Select a template and an employee to generate live document preview...";
    let text = selectedTemplate.body_template || "";
    const replacements: Record<string, string> = {
      "{{employee.name}}": selectedEmployee.name || "",
      "{{employee.designation}}": selectedEmployee.designation || selectedEmployee.role || "",
      "{{employee.department}}": selectedEmployee.department || "",
      "{{employee.employee_code}}": selectedEmployee.employee_code || selectedEmployee.empId || "",
      "{{employee.phone}}": selectedEmployee.phone || "",
      "{{employee.email}}": selectedEmployee.email || "",
    };
    for (const [key, value] of Object.entries(replacements)) {
      text = text.replaceAll(key, value);
    }
    return text;
  }, [selectedTemplate, selectedEmployee]);

  const mutation = useMutation({
    mutationFn: (payload: any) => generateLetter(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-letters"] });
      toast.success("Document generated successfully");
      navigate("/letters/history");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to generate letter");
    },
  });

  const handleGenerate = () => {
    if (!selectedTemplateId || !selectedEmployeeId) {
      toast.error("Please select both a template and an employee");
      return;
    }
    mutation.mutate({
      template_id: Number(selectedTemplateId),
      employee_id: Number(selectedEmployeeId),
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          Generate Employee Document
        </h1>
        <p className="text-sm text-muted-foreground">
          Select a template and an employee to generate personalized letters, certificates, and contracts.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Controls Card */}
        <Card className="border border-border/40 shadow-sm md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Document Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-select">Letter Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger id="tpl-select">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {templatesList.map((tpl: any) => (
                    <SelectItem key={tpl.id} value={String(tpl.id)}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="emp-select">Target Employee</Label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger id="emp-select">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employeesList.map((emp: any) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>
                      {emp.name || emp.email} ({emp.department || "General"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full gap-2 mt-4"
              onClick={handleGenerate}
              disabled={!selectedTemplateId || !selectedEmployeeId || mutation.isLoading}
            >
              <Send className="h-4 w-4" />
              {mutation.isLoading ? "Generating..." : "Generate Document"}
            </Button>
          </CardContent>
        </Card>

        {/* Live Preview Card */}
        <Card className="border border-border/40 shadow-sm md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/30">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              MNC Standard Document Live Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {selectedTemplate && selectedEmployee ? (
              <MncLetterDocument
                templateName={selectedTemplate.name}
                employeeName={selectedEmployee.name}
                employeeCode={selectedEmployee.employee_code || selectedEmployee.empId || `EMP-${selectedEmployee.id}`}
                designation={selectedEmployee.designation || selectedEmployee.role || "Team Member"}
                department={selectedEmployee.department || "General"}
                content={previewContent}
              />
            ) : (
              <div className="p-12 text-center text-muted-foreground border-2 border-dashed border-border/50 rounded-xl space-y-2">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground/60" />
                <p className="font-semibold text-foreground">No Document Selected</p>
                <p className="text-xs text-muted-foreground">Select a letter template and target employee on the left to render live MNC document letterhead.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
