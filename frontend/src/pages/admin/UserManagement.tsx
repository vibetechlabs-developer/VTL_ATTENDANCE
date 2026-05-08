import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Download, Trash2, Camera, Pencil, Copy, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDataStore, Employee } from "@/store/dataStore";
import { useAuthStore, type Role } from "@/store/authStore";
import { toast } from "sonner";
import { exportCsv } from "@/utils/csv";
import { usersCreateRequest, usersFaceDataRequest, usersListRequest, usersRegisterFaceRequest, usersUpdateRequest, type ApiEmployee } from "@/lib/api";

const emptyForm: Omit<Employee, "id"> = {
  name: "", email: "", empId: "", role: "employee", department: "Engineering",
  reportsTo: "—", joiningDate: new Date().toISOString().slice(0, 10),
  faceStatus: "pending", status: "active",
};

export default function UserManagement() {
  // Some browsers auto-mirror front camera previews. Keep this true to normalize.
  const NORMALIZE_FRONT_CAMERA = true;
  const { employees, deleteEmployee, setEmployeesFromApi } = useDataStore();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [createPassword, setCreatePassword] = useState("");
  const [lastCreatedPassword, setLastCreatedPassword] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [faceOpen, setFaceOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [faceBase64, setFaceBase64] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingFace, setSavingFace] = useState(false);
  const [faceDataOpen, setFaceDataOpen] = useState(false);
  const [faceData, setFaceData] = useState<any | null>(null);
  const [loadingFaceData, setLoadingFaceData] = useState(false);
  const [facePhotoError, setFacePhotoError] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const loadEmployees = async () => {
      try {
        const res = await usersListRequest(accessToken);
        if (!res.ok) return;
        const rows = (await res.json()) as ApiEmployee[];
        if (!cancelled) setEmployeesFromApi(rows);
      } catch {
        /* fallback to seeded store if API unavailable */
      }
    };
    void loadEmployees();
    return () => {
      cancelled = true;
    };
  }, [accessToken, setEmployeesFromApi]);

  useEffect(() => {
    if (!faceOpen) {
      setCameraReady(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const v = videoRef.current;
          const onReady = async () => {
            try {
              await v.play();
            } catch {
              /* ignore */
            }
            setCameraReady((v.videoWidth || 0) > 0 && (v.videoHeight || 0) > 0);
          };
          if ((v.videoWidth || 0) > 0 && (v.videoHeight || 0) > 0) {
            await onReady();
          } else {
            v.onloadedmetadata = () => void onReady();
          }
        }
      } catch {
        toast.error("Camera permission denied or camera unavailable");
        setFaceOpen(false);
      }
    };

    void startCamera();
  }, [faceOpen]);

  const departments = useMemo(
    () => [
      "all",
      ...Array.from(
        new Set(
          employees
            .map((e) => e.department.trim())
            .filter((department) => department.length > 0)
        )
      ),
    ],
    [employees]
  );

  const reportToOptions = useMemo(() => {
    const options = employees
      .filter((e) => (e.role === "admin" || e.role === "manager") && !!e.userId)
      .map((e) => ({
        value: String(e.userId),
        label: `${e.name} (${e.role === "admin" ? "Super Admin" : "Manager"})`,
      }));

    return options;
  }, [employees]);

  const resolveManagerId = (value?: string, fallbackName?: string): number | null => {
    if (value && value !== "—" && /^\d+$/.test(value)) return Number(value);
    const name = (fallbackName || value || "").trim();
    if (!name || name === "—") return null;
    const match = reportToOptions.find((opt) => opt.label.startsWith(`${name} (`));
    return match ? Number(match.value) : null;
  };

  const filtered = employees.filter((e) =>
    (dept === "all" || e.department === dept) &&
    (q === "" || [e.name, e.email, e.empId].some((v) => v.toLowerCase().includes(q.toLowerCase())))
  );

  const handleAdd = async () => {
    if (!form.name || !form.email || !form.empId) {
      toast.error("Please fill in name, email and employee ID");
      return;
    }
    if (!accessToken) {
      toast.error("Session expired. Please login again.");
      return;
    }
    try {
      const res = await usersCreateRequest(accessToken, {
        name: form.name,
        email: form.email,
        role: form.role,
        department: form.department,
        manager_id: resolveManagerId(form.reportsTo),
        password: createPassword.trim() || undefined,
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        temporaryPassword?: string;
      };
      if (!res.ok) {
        toast.error(body.error || "Could not create employee");
        return;
      }
      const listRes = await usersListRequest(accessToken);
      if (listRes.ok) {
        const rows = (await listRes.json()) as ApiEmployee[];
        setEmployeesFromApi(rows);
      }
      toast.success(
        body.temporaryPassword
          ? `${form.name} added. Temporary password: ${body.temporaryPassword}`
          : `${form.name} added successfully`
      );
      setLastCreatedPassword(body.temporaryPassword ?? (createPassword.trim() || null));
      setForm(emptyForm);
      setCreatePassword("");
      setOpen(false);
    } catch {
      toast.error("Could not create employee");
    }
  };

  const openEdit = (employee: Employee) => {
    setSelectedEmployee(employee);
    setEditPassword("");
    setEditOpen(true);
  };

  const openFaceRegister = (employee: Employee) => {
    setSelectedEmployee(employee);
    setFaceBase64("");
    setFaceOpen(true);
  };

  const handleEditSave = async () => {
    if (!selectedEmployee || !accessToken) return;
    setSavingEdit(true);
    try {
      const res = await usersUpdateRequest(accessToken, selectedEmployee.id, {
        name: selectedEmployee.name,
        email: selectedEmployee.email,
        role: selectedEmployee.role,
        department: selectedEmployee.department,
        manager_id: resolveManagerId(selectedEmployee.managerUserId, selectedEmployee.reportsTo),
        password: editPassword.trim() || undefined,
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || "Could not update employee");
        return;
      }
      const listRes = await usersListRequest(accessToken);
      if (listRes.ok) {
        const rows = (await listRes.json()) as ApiEmployee[];
        setEmployeesFromApi(rows);
      }
      toast.success("Employee updated");
      setEditOpen(false);
      setSelectedEmployee(null);
      setEditPassword("");
    } finally {
      setSavingEdit(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const handleFaceRegister = async () => {
    if (!selectedEmployee || !accessToken) {
      toast.error("Session expired. Please login again.");
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady) {
      toast.error("Camera is not ready");
      return;
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      toast.error("Camera stream not ready yet. Please wait 1–2 seconds and try again.");
      return;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Could not capture face frame");
      return;
    }
    if (NORMALIZE_FRONT_CAMERA) {
      // Un-mirror capture so stored face image matches natural orientation.
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -width, 0, width, height);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0, width, height);
    }
    // Prefer PNG for maximum compatibility with backend decoders
    const capturedBase64 = canvas.toDataURL("image/png");
    setFaceBase64(capturedBase64);

    setSavingFace(true);
    try {
      const res = await usersRegisterFaceRequest(accessToken, selectedEmployee.id, capturedBase64);
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        toast.error(body.error || "Face registration failed");
        return;
      }
      const listRes = await usersListRequest(accessToken);
      if (listRes.ok) {
        const rows = (await listRes.json()) as ApiEmployee[];
        setEmployeesFromApi(rows);
      }
      toast.success(body.message || "Face registered");
      setFaceOpen(false);
      setSelectedEmployee(null);
      setFaceBase64("");
    } finally {
      setSavingFace(false);
    }
  };

  const openFaceData = async (employee: Employee) => {
    if (!accessToken) {
      toast.error("Session expired. Please login again.");
      return;
    }
    setSelectedEmployee(employee);
    setFaceDataOpen(true);
    setLoadingFaceData(true);
    setFacePhotoError(false);
    setFaceData(null);
    try {
      const res = await usersFaceDataRequest(accessToken, employee.id);
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || "Could not load face data");
        return;
      }
      setFaceData(body);
    } finally {
      setLoadingFaceData(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-1">Manage employees, roles and access.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => exportCsv("employees.csv", filtered)}>
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary shadow-md w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" /> Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add new employee</DialogTitle>
                <DialogDescription>
                  Create a new team member profile with role and department details.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Full name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Employee ID</Label>
                    <Input value={form.empId} onChange={(e) => setForm({ ...form, empId: e.target.value })} placeholder="VTL-021" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={(v: Role) => setForm({ ...form, role: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="hr">HR</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Department</Label>
                    <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Reports to</Label>
                    <Select value={form.reportsTo} onValueChange={(v) => setForm({ ...form, reportsTo: v })}>
                      <SelectTrigger><SelectValue placeholder="Select reporting manager" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="—">None</SelectItem>
                        {reportToOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Joining date</Label>
                    <Input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Password (optional)</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="text"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      placeholder="Leave blank to auto-generate"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => setCreatePassword(Math.random().toString(36).slice(2, 10) + "@123")}
                    >
                      Generate
                    </Button>
                  </div>
                </div>

                {lastCreatedPassword && (
                  <div className="rounded-lg border border-border bg-muted/20 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Last created user password</p>
                      <p className="font-mono text-sm truncate">{lastCreatedPassword}</p>
                    </div>
                    <Button type="button" variant="outline" size="icon" onClick={() => void copyText(lastCreatedPassword)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <DialogFooter>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={() => void handleAdd()} className="bg-gradient-primary w-full sm:w-auto">Add employee</Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
          <div className="relative flex-1 w-full sm:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, email or ID" className="pl-9 w-full" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>{d === "all" ? "All departments" : d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No users found" description="Try adjusting your filters or search." />
        ) : (
          <>
            {/* Mobile/tablet: card list so actions never disappear */}
            <div className="lg:hidden space-y-3">
              {filtered.map((e) => (
                <Card key={e.id} className="p-4 border-glow-shine">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs">
                          {e.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{e.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{e.email}</p>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{e.empId}</p>
                      </div>
                    </div>
                    <StatusPill
                      label={e.role}
                      variant={e.role === "admin" ? "info" : e.role === "manager" ? "warning" : e.role === "hr" ? "success" : "muted"}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="rounded-lg bg-muted/30 px-3 py-2">
                      <p className="text-muted-foreground">Department</p>
                      <p className="font-medium text-sm truncate">{e.department}</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 px-3 py-2">
                      <p className="text-muted-foreground">Joined</p>
                      <p className="font-medium text-sm">{e.joiningDate}</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 px-3 py-2">
                      <p className="text-muted-foreground">Reports to</p>
                      <p className="font-medium text-sm truncate">{e.reportsTo}</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 px-3 py-2">
                      <p className="text-muted-foreground">Face</p>
                      <div className="mt-1">
                        <StatusPill label={e.faceStatus} variant={e.faceStatus === "registered" ? "success" : "warning"} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={!e.hasEmployeeProfile}
                      onClick={() => void openFaceData(e)}
                    >
                      <Eye className="h-4 w-4 mr-2" /> View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={!e.hasEmployeeProfile}
                      onClick={() => openFaceRegister(e)}
                    >
                      <Camera className="h-4 w-4 mr-2" /> Face
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={!e.hasEmployeeProfile}
                      onClick={() => openEdit(e)}
                    >
                      <Pencil className="h-4 w-4 mr-2" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={!e.hasEmployeeProfile}
                      onClick={() => { deleteEmployee(e.id); toast.success(`${e.name} removed`); }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden lg:block overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Employee</TableHead>
                  <TableHead>EMP ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Reports to</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Face</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs">
                            {e.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{e.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{e.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.empId}</TableCell>
                    <TableCell>
                      <StatusPill
                        label={e.role}
                        variant={e.role === "admin" ? "info" : e.role === "manager" ? "warning" : e.role === "hr" ? "success" : "muted"}
                      />
                    </TableCell>
                    <TableCell className="text-sm">{e.department}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.reportsTo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.joiningDate}</TableCell>
                    <TableCell>
                      <StatusPill label={e.faceStatus} variant={e.faceStatus === "registered" ? "success" : "warning"} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={!e.hasEmployeeProfile}
                          onClick={() => void openFaceData(e)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={!e.hasEmployeeProfile}
                          onClick={() => openFaceRegister(e)}
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={!e.hasEmployeeProfile}
                          onClick={() => openEdit(e)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={!e.hasEmployeeProfile}
                          onClick={() => { deleteEmployee(e.id); toast.success(`${e.name} removed`); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit employee</DialogTitle>
            <DialogDescription>Update employee details and save to backend.</DialogDescription>
          </DialogHeader>
          {selectedEmployee && (
            <div className="grid gap-3 py-2">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input value={selectedEmployee.name} onChange={(e) => setSelectedEmployee({ ...selectedEmployee, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={selectedEmployee.email} onChange={(e) => setSelectedEmployee({ ...selectedEmployee, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={selectedEmployee.role} onValueChange={(v: Role) => setSelectedEmployee({ ...selectedEmployee, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Input value={selectedEmployee.department} onChange={(e) => setSelectedEmployee({ ...selectedEmployee, department: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Reports to</Label>
                <Select
                  value={selectedEmployee.managerUserId || "—"}
                  onValueChange={(v) =>
                    setSelectedEmployee({
                      ...selectedEmployee,
                      managerUserId: v === "—" ? undefined : v,
                      reportsTo: v === "—" ? "—" : (reportToOptions.find((opt) => opt.value === v)?.label.split(" (")[0] || selectedEmployee.reportsTo),
                    })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Select reporting manager" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="—">None</SelectItem>
                    {reportToOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Change password (optional)</Label>
                <Input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter new password to reset"
                />
                <p className="text-[11px] text-muted-foreground">If empty, password will remain unchanged.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setEditOpen(false)} disabled={savingEdit}>Cancel</Button>
              <Button onClick={() => void handleEditSave()} disabled={savingEdit} className="bg-gradient-primary w-full sm:w-auto">
                {savingEdit ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={faceOpen} onOpenChange={setFaceOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Register employee face</DialogTitle>
            <DialogDescription>Live camera scan કરીને employee face register કરો.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-xl overflow-hidden border border-border bg-muted/20">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-56 object-cover"
                style={{ transform: NORMALIZE_FRONT_CAMERA ? "scaleX(-1)" : "none" }}
              />
            </div>
            {faceBase64 && (
              <img src={faceBase64} alt="Captured face preview" className="h-36 w-full object-cover rounded-lg border border-border" />
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaceOpen(false)} disabled={savingFace}>Cancel</Button>
            <Button onClick={() => void handleFaceRegister()} disabled={!cameraReady || savingFace} className="bg-gradient-primary">
              {savingFace ? "Scanning..." : "Live Scan & Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={faceDataOpen} onOpenChange={setFaceDataOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Face DB Data</DialogTitle>
            <DialogDescription>
              Stored face vector details for {selectedEmployee?.name || "employee"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {loadingFaceData ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : !faceData ? (
              <p className="text-sm text-muted-foreground">No data found.</p>
            ) : (
              <>
                {faceData.profile_photo ? (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground mb-2">Stored face photo</p>
                    {facePhotoError ? (
                      <div className="h-44 w-full rounded-md bg-muted/20 border border-border/50 flex items-center justify-center text-xs text-muted-foreground px-3 text-center">
                        Image not available
                      </div>
                    ) : (
                      <img
                        src={faceData.profile_photo_data_url || faceData.profile_photo}
                        alt={`${selectedEmployee?.name || "Employee"} face`}
                        className="h-44 w-full object-cover rounded-md border border-border/50"
                        onError={() => setFacePhotoError(true)}
                      />
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Stored face photo</p>
                    <p className="text-sm mt-1">No face photo stored yet. Re-register face to save latest snapshot.</p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Registered</p>
                    <p className="font-semibold mt-1">{faceData.has_face ? "Yes" : "No"}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Vector length</p>
                    <p className="font-semibold mt-1">{faceData.vector_length || 0}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Employee ID</p>
                    <p className="font-semibold mt-1">{selectedEmployee?.empId}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground mb-2">Vector preview (first 12 values)</p>
                  <div className="max-h-[180px] overflow-y-auto rounded-md bg-muted/10 p-2">
                    <code className="text-xs break-all">
                      {Array.isArray(faceData.vector_preview) && faceData.vector_preview.length > 0
                        ? JSON.stringify(faceData.vector_preview)
                        : "No stored vector preview"}
                    </code>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaceDataOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
