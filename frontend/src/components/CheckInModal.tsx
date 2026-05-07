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
    const [errorText, setErrorText] = useState<string>("");
    const startedRef = useRef(false);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const accessToken = useAuthStore((s) => s.accessToken);
    const logout = useAuthStore((s) => s.logout);

    const parseClientError = (err: unknown): string => {
        const msg = typeof (err as { message?: unknown })?.message === "string"
            ? (err as { message: string }).message
            : "";
        if (!msg) return mode === "check-in" ? "Check-in failed." : "Check-out failed.";
        if (/permission/i.test(msg) && /geolocation/i.test(msg)) return "Location permission denied. Please allow GPS/location and retry.";
        if (/timeout/i.test(msg) && /position/i.test(msg)) return "Could not fetch location in time. Please enable GPS and retry.";
        if (/camera/i.test(msg)) return msg;
        return msg;
    };

    const parseApiError = (
        status: number,
        body: {
            error?: string;
            message?: string;
            detail?: string;
            distance_meters?: number | null;
            face_distance?: number | null;
            threshold?: number | null;
        }
    ): string => {
        const base = body.error || body.detail || body.message;
        if (base && /token not valid|given token not valid|token is invalid|token is expired/i.test(base)) {
            return "Your session has expired. Please login again.";
        }
        if (base) {
            if (body.face_distance != null && body.threshold != null) {
                return `${base} (score: ${body.face_distance}, required <= ${body.threshold})`;
            }
            return base;
        }
        if (status === 401) return "Face verification failed. Please align face clearly and retry.";
        if (status === 403) return "You are not allowed to perform this action.";
        if (status === 503) return "Face verification service is unavailable right now. Please retry in a moment.";
        return mode === "check-in" ? "Check-in failed." : "Check-out failed.";
    };

    const restartCamera = async (): Promise<boolean> => {
        try {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
            const v = videoRef.current;
            if (v) {
                try { v.pause(); } catch { /* ignore */ }
                v.srcObject = null;
            }
            // Small cooldown helps some mobile devices release prior camera handle.
            await new Promise((r) => window.setTimeout(r, 180));
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "user",
                    width: { ideal: 640, min: 240 },
                    height: { ideal: 480, min: 180 },
                    frameRate: { ideal: 24, max: 30 },
                },
                audio: false,
            });
            streamRef.current = stream;
            if (!v) return false;
            v.srcObject = stream;
            try { await v.play(); } catch { /* ignore */ }
            const ready = await ensureVideoReady();
            setCameraReady(ready);
            return ready;
        } catch {
            setCameraReady(false);
            return false;
        }
    };

    const ensureVideoReady = async (): Promise<boolean> => {
        const v = videoRef.current;
        if (!v) return false;

        const hasSize = () => (v.videoWidth || 0) > 0 && (v.videoHeight || 0) > 0;
        const isRenderable = () => hasSize() && v.readyState >= 2;
        if (isRenderable()) return true;

        // Retry for slow mobile/webcam initialization cases.
        // Some mobile browsers take longer than 1-2 seconds to update dimensions.
        const hardTimeoutMs = 12000;
        const start = Date.now();

        while (Date.now() - start < hardTimeoutMs) {
            try {
                if (streamRef.current) {
                    // Always reattach to current stream; srcObject equality checks can be unreliable.
                    v.srcObject = streamRef.current;
                }
                await v.play();
            } catch {
                // Ignore autoplay/play race and keep retrying.
            }

            if (isRenderable()) return true;

            // Wait for the browser to populate metadata/canplay.
            await new Promise<boolean>((resolve) => {
                if (isRenderable()) return resolve(true);

                const done = (ok: boolean) => {
                    v.removeEventListener("loadedmetadata", onMeta);
                    v.removeEventListener("canplay", onCanPlay);
                    v.removeEventListener("loadeddata", onData);
                    resolve(ok);
                };

                const onMeta = () => done(isRenderable());
                const onCanPlay = () => done(isRenderable());
                const onData = () => done(isRenderable());

                v.addEventListener("loadedmetadata", onMeta, { once: true });
                v.addEventListener("canplay", onCanPlay, { once: true });
                v.addEventListener("loadeddata", onData, { once: true });

                window.setTimeout(() => done(isRenderable()), 900);
            });

            if (isRenderable()) return true;
        }

        return isRenderable();
    };

    useEffect(() => {
        if (open) {
            setStep("face");
            setFaceProgress(0);
            setLocProgress(0);
            setCameraReady(false);
            setSubmitting(false);
            setErrorText("");
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
            const ok = await restartCamera();
            if (!ok) {
                toast.error("Camera permission denied or camera unavailable");
                onOpenChange(false);
            }
        };
        void startCamera();
    }, [open, onOpenChange]);

    useEffect(() => {
        // Auto-start verification once the modal opens and camera is ready.
        if (!open) return;
        if (step !== "face") return;
        if (!cameraReady) return;
        if (submitting) return;
        if (startedRef.current) return;
        void handleVerifyAndSubmit();
    }, [open, step, cameraReady, submitting]);

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
        setErrorText("");
        if (!accessToken) { toast.error("Session expired. Please login again."); return; }
        if (!cameraReady) {
            const ready = await restartCamera();
            if (!ready) {
                const msg = "Camera stream not ready. Please allow camera access and close other camera apps, then retry.";
                setErrorText(msg);
                toast.error(msg);
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
                const msg = parseApiError(res.status, body);
                setErrorText(msg);
                toast.error(msg);
                if (res.status === 401 && /session has expired/i.test(msg)) {
                    await logout();
                    onOpenChange(false);
                    window.location.href = "/login";
                    return;
                }
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
            const msg = parseClientError(e);
            setErrorText(msg);
            toast.error(msg);
            setStep("face");
        } finally {
            setSubmitting(false);
        }
    };

    const handleRetry = async () => {
        if (submitting) return;
        setErrorText("");
        setFaceProgress(0);
        setLocProgress(0);
        setStep("face");
        const ready = await restartCamera();
        if (!ready) {
            const msg = "Camera could not be re-initialized. Please close other camera apps and retry.";
            setErrorText(msg);
            toast.error(msg);
            return;
        }
        await handleVerifyAndSubmit();
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
                            <div className="mx-auto h-44 w-44 rounded-full overflow-hidden border-2 border-primary/40 bg-muted/10 shadow-sm">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="h-full w-full object-cover [transform:scaleX(1)]"
                                />
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
                        {errorText ? (
                            <div className="w-full rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                {errorText}
                            </div>
                        ) : null}
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void handleRetry()}
                            disabled={submitting}
                            className="bg-sage-3d border-0 text-primary-foreground"
                        >
                            {submitting ? "Scanning..." : "Retry scan"}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
