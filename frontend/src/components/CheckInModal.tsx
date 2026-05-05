import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { ScanFace, MapPin, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { attendanceCheckInRequest, attendanceCheckOutRequest } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";

interface CheckInModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onVerified: (data?: { checkInAt?: string; checkOutAt?: string; totalHours?: number }) => void;
    mode?: "check-in" | "check-out";
}

export function CheckInModal({ open, onOpenChange, onVerified, mode = "check-in" }: CheckInModalProps) {
    const [step, setStep] = useState<"face" | "location" | "done" | null>(null);
    const [faceProgress, setFaceProgress] = useState(0);
    const [locProgress, setLocProgress] = useState(0);
    const [cameraReady, setCameraReady] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const startedRef = useRef(false);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const accessToken = useAuthStore((s) => s.accessToken);

    useEffect(() => {
        if (open) {
            setStep("face");
            setFaceProgress(0);
            setLocProgress(0);
            setCameraReady(false);
            setSubmitting(false);
            startedRef.current = false;
        } else {
            setStep(null);
            setCameraReady(false);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                streamRef.current = stream;
                if (videoRef.current) {
                    const v = videoRef.current;
                    v.srcObject = stream;
                    const markReadyIfSized = () => {
                        const ok = (v.videoWidth || 0) > 0 && (v.videoHeight || 0) > 0;
                        if (ok) setCameraReady(true);
                        return ok;
                    };
                    const onReady = async () => {
                        try { await v.play(); } catch { /* ignore */ }
                        markReadyIfSized();
                    };
                    if (!markReadyIfSized()) {
                        v.onloadedmetadata = () => void onReady();
                        v.oncanplay = () => void onReady();
                        // Some cameras take a moment to report video dimensions.
                        let tries = 0;
                        const t = window.setInterval(() => {
                            tries += 1;
                            if (markReadyIfSized() || tries > 25) {
                                window.clearInterval(t);
                            }
                        }, 120);
                    }
                }
            } catch {
                toast.error("Camera permission denied or camera unavailable");
                onOpenChange(false);
            }
        };
        void startCamera();
    }, [open, onOpenChange]);

    const getLocation = (): Promise<{ latitude: number; longitude: number }> =>
        new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
                (err) => reject(err),
                { enableHighAccuracy: true, timeout: 15000 }
            );
        });

    const captureImage = (): string => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) throw new Error("Camera not ready");
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) throw new Error("Camera stream not ready");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not capture frame");
        ctx.drawImage(video, 0, 0, w, h);
        return canvas.toDataURL("image/png");
    };

    const handleVerifyAndSubmit = async () => {
        if (!accessToken) { toast.error("Session expired. Please login again."); return; }
        if (!cameraReady) {
            const v = videoRef.current;
            const readyBySize = !!v && (v.videoWidth || 0) > 0 && (v.videoHeight || 0) > 0;
            if (!readyBySize) {
                toast.error("Camera is not ready yet. Please wait 1-2 seconds and retry.");
                return;
            }
            setCameraReady(true);
        }
        startedRef.current = true;
        setSubmitting(true);
        setFaceProgress(10);
        try {
            const image = captureImage();
            setFaceProgress(55);
            setStep("location");
            const { latitude, longitude } = await getLocation();
            setLocProgress(55);
            const res = mode === "check-in"
                ? await attendanceCheckInRequest(accessToken, { image, latitude, longitude })
                : await attendanceCheckOutRequest(accessToken, { image, latitude, longitude });
            const body = (await res.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
                check_in?: string;
                check_out?: string;
                total_hours?: number;
            };
            if (!res.ok) {
                toast.error(body.error || (mode === "check-in" ? "Check-in failed" : "Check-out failed"));
                setStep("face");
                return;
            }
            setFaceProgress(100);
            setLocProgress(100);
            setStep("done");
            toast.success(body.message || (mode === "check-in" ? "Check-in successful" : "Check-out successful"));
            setTimeout(() => {
                onVerified({
                    checkInAt: body.check_in,
                    checkOutAt: body.check_out,
                    totalHours: Number(body.total_hours ?? 0),
                });
            }, 400);
        } catch (e: any) {
            toast.error(typeof e?.message === "string" ? e.message : (mode === "check-in" ? "Check-in failed" : "Check-out failed"));
            setStep("face");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md p-6 bg-card/95 backdrop-blur-3xl shadow-3d border-border/50 max-h-[85vh] overflow-y-auto flex flex-col">
                <DialogHeader className="sr-only">
                    <DialogTitle>Check-in verification</DialogTitle>
                    <DialogDescription>
                        Completes face and location verification before check-in is confirmed.
                    </DialogDescription>
                </DialogHeader>
                <AnimatePresence mode="wait">
                    {step === "face" && (
                        <motion.div
                            key="face"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            className="space-y-6 text-center"
                        >
                            <div className="space-y-1">
                                <h2 className="login-welcome text-2xl">Face Verification</h2>
                                <p className="login-welcome-sub">
                                    {mode === "check-in" ? "Align your face to check in." : "Align your face to check out."}
                                </p>
                            </div>

                            <div className="relative mx-auto w-44 h-44">
                                <div className="absolute inset-0 rounded-full login-verify-ring" />
                                <div className="absolute inset-2 rounded-full login-verify-inner flex items-center justify-center overflow-hidden">
                                    <ScanFace className="h-16 w-16 text-primary" />
                                    <motion.div
                                        className="absolute left-0 right-0 h-0.5 bg-primary/70 shadow-[0_0_16px_hsl(var(--primary))]"
                                        initial={{ top: "10%" }}
                                        animate={{ top: ["10%", "90%", "10%"] }}
                                        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                                    />
                                </div>
                                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="48" fill="none" stroke="hsl(var(--border))" strokeWidth="2" />
                                    <circle
                                        cx="50" cy="50" r="48" fill="none"
                                        stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round"
                                        strokeDasharray={`${(faceProgress / 100) * 301.6} 301.6`}
                                        className="transition-all duration-100"
                                    />
                                </svg>
                            </div>

                            <div className="flex justify-center gap-2">
                                {[0, 16, 33, 50, 66, 83].map((threshold) => (
                                    <div
                                        key={threshold}
                                        className={cn(
                                            "biometric-dot transition-all duration-300",
                                            faceProgress >= threshold && "biometric-dot-active"
                                        )}
                                    />
                                ))}
                            </div>

                            <div>
                                <p className="text-sm font-semibold tabular-nums login-brand-name">{faceProgress}%</p>
                                <p className="text-xs login-welcome-sub mt-1">
                                    {!cameraReady
                                        ? "Waiting for camera..."
                                        : submitting
                                            ? "Verifying face..."
                                            : "Ready. Click start to verify."}
                                </p>
                            </div>
                            <div className="rounded-xl overflow-hidden border border-border/50 bg-muted/10">
                                <video ref={videoRef} autoPlay playsInline muted className="w-full h-44 object-cover" />
                            </div>
                            <canvas ref={canvasRef} className="hidden" />
                        </motion.div>
                    )}

                    {step === "location" && (
                        <motion.div
                            key="location"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            className="space-y-6 text-center"
                        >
                            <div className="space-y-1">
                                <h2 className="login-welcome text-2xl">Location Check</h2>
                                <p className="login-welcome-sub">Ensuring you are inside the active radius.</p>
                            </div>

                            <div className="relative mx-auto w-44 h-44">
                                <div className="absolute inset-0 rounded-3xl login-verify-ring" />
                                <div className="absolute inset-2 rounded-3xl login-verify-inner flex items-center justify-center">
                                    <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>
                                        <MapPin className="h-16 w-16 text-primary" />
                                    </motion.div>
                                </div>
                                <motion.div
                                    className="absolute inset-0 rounded-3xl border-2 border-primary/30"
                                    animate={{ scale: [1, 1.15], opacity: [0.6, 0] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                />
                            </div>

                            <div className="space-y-2 px-6">
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                    <motion.div
                                        className="h-full rounded-full"
                                        style={{ background: "linear-gradient(90deg, #1D9E75, #25d499)" }}
                                        animate={{ width: `${locProgress}%` }}
                                        transition={{ duration: 0.1 }}
                                    />
                                </div>
                                <p className="text-xs login-welcome-sub">
                                    {submitting
                                        ? "Fetching location & checking office radius..."
                                        : "Waiting for location permission..."}
                                </p>
                                {locProgress >= 30 && locProgress < 100 && (
                                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] font-mono login-welcome-sub">
                                        23.0225° N, 72.5714° E
                                    </motion.p>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {step === "done" && (
                        <motion.div
                            key="done"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center space-y-4 py-8"
                        >
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                className="mx-auto h-20 w-20 rounded-full bg-sage-3d shadow-3d flex items-center justify-center"
                            >
                                <CheckCircle2 className="h-10 w-10 text-white" />
                            </motion.div>
                            <div className="space-y-1">
                                <h2 className="text-2xl font-bold login-welcome">Checked In!</h2>
                                <p className="text-sm login-welcome-sub">You are now successfully on the clock.</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {step !== "done" && (
                    <DialogFooter className="mt-4 gap-2 sticky bottom-0 bg-card/95 pt-3">
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void handleVerifyAndSubmit()}
                            disabled={!cameraReady || submitting}
                            className="bg-sage-3d border-0 text-primary-foreground"
                        >
                            {submitting ? "Scanning..." : (startedRef.current ? "Retry scan" : "Start scan")}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
