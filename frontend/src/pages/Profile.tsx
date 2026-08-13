import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Save, Mail, Phone, MapPin, Briefcase, IdCard, Camera, ScanFace, Eye, EyeOff, UserCheck } from "lucide-react";
import { createProfileChangeRequest } from "@/api/ess";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { userInitials } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/store/authStore";
import { meRequest, meUpdateRequest, registerFaceRequest } from "@/lib/api";
import { profileToAuthUser } from "@/store/authStore";
import { toast } from "sonner";

export default function Profile() {
  const { user, accessToken, updateProfile } = useAuthStore();
  const [faceOpen, setFaceOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [registeringFace, setRegisteringFace] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changeRequestOpen, setChangeRequestOpen] = useState(false);
  const [changeField, setChangeField] = useState("name");
  const [requestedVal, setRequestedVal] = useState("");
  const [submittingChange, setSubmittingChange] = useState(false);

  const handleRequestChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestedVal.trim()) {
      toast.error("Requested value cannot be empty");
      return;
    }
    setSubmittingChange(true);
    try {
      await createProfileChangeRequest({
        field_name: changeField,
        requested_value: requestedVal.trim(),
      });
      toast.success("Profile change request submitted to HR");
      setChangeRequestOpen(false);
      setRequestedVal("");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to submit change request");
    } finally {
      setSubmittingChange(false);
    }
  };
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    location: user?.location ?? "",
    bio: user?.bio ?? "",
    department: user?.department ?? "",
  });

  const initials = userInitials(user?.name);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) {
      toast.error("Session expired. Please login again.");
      return;
    }
    if (newPassword && newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      toast.error("Password and confirm password must match.");
      return;
    }
    const res = await meUpdateRequest(accessToken, {
      name: form.name,
      email: form.email,
      phone: form.phone,
      department: form.department,
      password: newPassword || undefined,
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(body.error || "Could not update profile");
      return;
    }
    const meRes = await meRequest(accessToken);
    if (meRes.ok) {
      const meBody = await meRes.json();
      updateProfile(profileToAuthUser(meBody));
    } else {
      updateProfile(form);
    }
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Profile updated");
  };

  useEffect(() => {
    if (!faceOpen) return;
    let stream: MediaStream | null = null;
    const setup = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch {
        toast.error("Camera permission denied or camera not available");
        setFaceOpen(false);
      }
    };
    void setup();
    return () => {
      setCameraReady(false);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [faceOpen]);

  const handleFaceRegister = async () => {
    if (!accessToken) {
      toast.error("Please login again");
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady) {
      toast.error("Camera is not ready");
      return;
    }

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Could not capture image");
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.9);

    setRegisteringFace(true);
    try {
      const res = await registerFaceRequest(accessToken, imageBase64);
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        toast.error(body.error || "Face registration failed");
        return;
      }
      toast.success(body.message || "Face registered successfully");
      setFaceOpen(false);
    } finally {
      setRegisteringFace(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your public details.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Avatar + summary */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="card-3d border-0">
            <CardContent className="p-6 text-center space-y-4">
              <div className="relative inline-block">
                <div className="absolute -inset-2 rounded-full bg-sage-3d opacity-50 blur-xl" />
                <Avatar className="h-28 w-28 mx-auto border-4 border-card shadow-3d relative">
                  <AvatarFallback className="bg-gradient-primary text-primary-foreground text-2xl font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => setFaceOpen(true)}
                  className="absolute bottom-1 right-1 h-9 w-9 rounded-full bg-sage-3d shadow-3d flex items-center justify-center text-primary-foreground hover:scale-105 transition-smooth"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>
              <div>
                <p className="font-bold text-lg">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role} · {user?.department}</p>
              </div>
              <div className="space-y-2 pt-3 border-t border-border text-left">
                <div className="flex items-center gap-2 text-sm"><IdCard className="h-4 w-4 text-muted-foreground" /> {user?.empId}</div>
                <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /> <span className="truncate">{user?.email}</span></div>
                <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /> {user?.phone}</div>
                <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" /> {user?.location}</div>
                <div className="flex items-center gap-2 text-sm"><Briefcase className="h-4 w-4 text-muted-foreground" /> {user?.department}</div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Edit form */}
        <Card className="lg:col-span-2 card-3d border-0">
          <CardHeader><CardTitle>Edit details</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input value={form.name} onChange={set("name")} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={set("email")} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={set("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={form.location} onChange={set("location")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Department</Label>
                <Input value={form.department} onChange={set("department")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Bio</Label>
                <Textarea value={form.bio} onChange={set("bio")} className="min-h-[100px]" />
              </div>
              <div className="space-y-1.5">
                <Label>New password</Label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Leave blank to keep unchanged"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Confirm new password</Label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="sm:col-span-2 flex justify-between items-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setChangeRequestOpen(true)}
                  className="text-xs gap-1.5"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  Request Sensitive Field Change
                </Button>
                <Button type="submit" className="bg-sage-3d shadow-3d border-0 text-primary-foreground">
                  <Save className="h-4 w-4 mr-2" /> Save changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Sensitive Profile Change Request Modal */}
      <Dialog open={changeRequestOpen} onOpenChange={setChangeRequestOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" /> Request Profile Change
            </DialogTitle>
            <DialogDescription>
              Submit a formal request to HR to change sensitive employee fields (Name, Phone, Location, Bank Details).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRequestChangeSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="field_name">Field to Change</Label>
              <select
                id="field_name"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={changeField}
                onChange={(e) => setChangeField(e.target.value)}
              >
                <option value="name">Full Name</option>
                <option value="phone">Phone Number</option>
                <option value="location">Location / Address</option>
                <option value="bank_account_number">Bank Account Number</option>
                <option value="ifsc_code">IFSC Code</option>
                <option value="emergency_contact">Emergency Contact</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="requested_value">New Value</Label>
              <Input
                id="requested_value"
                required
                placeholder="Enter new value"
                value={requestedVal}
                onChange={(e) => setRequestedVal(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setChangeRequestOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingChange}>
                {submittingChange ? "Submitting..." : "Submit Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={faceOpen} onOpenChange={setFaceOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanFace className="h-5 w-5 text-primary" /> Register Face
            </DialogTitle>
            <DialogDescription>
              Look straight at the camera and capture a clear frame for face verification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-xl overflow-hidden border border-border bg-muted/20">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-[300px] object-cover" />
            </div>
            <p className="text-xs text-muted-foreground">
              Make sure your face is centered and well lit before capture.
            </p>
          </div>

          <canvas ref={canvasRef} className="hidden" />

          <DialogFooter>
            <Button variant="outline" onClick={() => setFaceOpen(false)} disabled={registeringFace}>
              Cancel
            </Button>
            <Button onClick={() => void handleFaceRegister()} disabled={!cameraReady || registeringFace} className="bg-sage-3d border-0 text-primary-foreground">
              {registeringFace ? "Registering..." : "Capture & Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
