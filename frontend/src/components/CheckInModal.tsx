import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { attendanceCheckInRequest, attendanceCheckOutRequest } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import {
    inferApiErrorContext,
    parseVerificationApiError,
    toVerificationError,
    type VerificationError,
} from "@/utils/verificationErrors";
import { captureFaceDataUrl, drawFaceFrame, MIRROR_CAMERA_PREVIEW } from "@/utils/faceCapture";
import {
    geolocationErrorMessage,
    getCurrentLocation,
    queryGeolocationPermission,
    validateCoordinates,
    warmupGeolocation,
} from "@/utils/geolocation";
import {
    AttendanceSubmitError,
    isFaceVerificationError,
    isLocationVerificationError,
} from "@/utils/checkInErrors";

interface CheckInModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onVerified: (data?: { checkInAt?: string; checkOutAt?: string; totalHours?: number; overtimeHours?: number }) => void;
    mode?: "check-in" | "check-out";
    checkoutMeta?: { allowOutsideMeeting?: boolean; outsideNote?: string };
}

export function CheckInModal({ open, onOpenChange, onVerified, mode = "check-in", checkoutMeta }: CheckInModalProps) {
    // Mirror preview only; captured frames stay unflipped (matches Profile face registration).
    const [step, setStep] = useState<"face" | "location" | "done" | null>(null);
    const [faceProgress, setFaceProgress] = useState(0);
    const [locProgress, setLocProgress] = useState(0);
    const [cameraReady, setCameraReady] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [verificationError, setVerificationError] = useState<VerificationError | null>(null);
    const startedRef = useRef(false);
    const lastImageRef = useRef<string | null>(null);
    const [locationHint, setLocationHint] = useState<string | null>(null);
    const [coordsPreview, setCoordsPreview] = useState<string | null>(null);
    /** Face scan hold duration (ms) — keeps camera steady before capture. */
    const SCAN_DURATION_MS = 4000;

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const accessToken = useAuthStore((s) => s.accessToken);
    const isWfh = useAuthStore((s) => s.user?.isWfh);
    const logout = useAuthStore((s) => s.logout);

    const cameraInitError = (err: unknown): VerificationError => {
        const e = err as { name?: string; message?: string };
        const name = (e?.name || "").toLowerCase();
        const msg = (e?.message || "").toLowerCase();
        if (name.includes("notallowed") || name.includes("security")) {
            return toVerificationError("camera permission denied", mode, "camera");
        }
        if (name.includes("notreadable") || msg.includes("could not start video source")) {
            return toVerificationError("camera busy notreadable", mode, "camera");
        }
        if (name.includes("overconstrained")) {
            return toVerificationError("camera overconstrained", mode, "camera");
        }
        if (name.includes("notfound")) {
            return toVerificationError("camera not found", mode, "camera");
        }
        if (name.includes("abort")) {
            return toVerificationError("camera abort", mode, "camera");
        }
        return toVerificationError(e?.message || "camera unavailable", mode, "camera");
    };

    const restartCamera = async (): Promise<boolean> => {
        const waitForVideoElement = async (): Promise<HTMLVideoElement | null> => {
            // On some mobile browsers dialog animation completes before <video> mounts.
            for (let i = 0; i < 20; i += 1) {
                const v = videoRef.current;
                if (v) return v;
                await new Promise((r) => window.setTimeout(r, 80));
            }
            return videoRef.current;
        };

        const tryGetStream = async (): Promise<MediaStream> => {
            const attempts: MediaStreamConstraints[] = [
                {
                    video: {
                        facingMode: { ideal: "user" },
                        width: { ideal: 640, min: 240 },
                        height: { ideal: 480, min: 180 },
                        frameRate: { ideal: 24, max: 30 },
                    },
                    audio: false,
                },
                { video: { facingMode: "user" }, audio: false },
                { video: true, audio: false },
            ];
            let lastErr: unknown = null;
            for (const c of attempts) {
                try {
                    return await navigator.mediaDevices.getUserMedia(c);
                } catch (e) {
                    lastErr = e;
                }
            }
            throw lastErr ?? new Error("camera init failed");
        };

        try {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
            let v = videoRef.current;
            if (v) {
                try { v.pause(); } catch { /* ignore */ }
                v.srcObject = null;
            }
            // Small cooldown helps some mobile devices release prior camera handle.
            await new Promise((r) => window.setTimeout(r, 180));
            const stream = await tryGetStream();
            streamRef.current = stream;
            if (!v) {
                v = await waitForVideoElement();
            }
            if (!v) {
                setCameraReady(false);
                setVerificationError(
                    toVerificationError("Camera view not ready yet", mode, "camera")
                );
                return false;
            }
            v.srcObject = stream;
            try { await v.play(); } catch { /* ignore */ }
            const ready = await ensureVideoReady();
            setCameraReady(ready);
            return ready;
        } catch (err) {
            setCameraReady(false);
            setVerificationError(cameraInitError(err));
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
            setVerificationError(null);
            setLocationHint(null);
            setCoordsPreview(null);
            lastImageRef.current = null;
            startedRef.current = false;
        } else {
            setStep(null);
            setCameraReady(false);
            setLocationHint(null);
            setCoordsPreview(null);
            lastImageRef.current = null;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        warmupGeolocation();
        void queryGeolocationPermission().then((perm) => {
            if (perm === "denied") {
                setLocationHint(
                    "Location is blocked on this phone. Allow it in Chrome/Safari site settings, then tap Retry scan.",
                );
            } else if (perm === "prompt") {
                setLocationHint("When the browser asks, tap Allow for location — required for check-in.");
            } else {
                setLocationHint(null);
            }
        });
        const startCamera = async () => {
            // Auto-retry startup a few times to avoid manual "Retry scan" on first open.
            let ok = false;
            for (let attempt = 0; attempt < 3; attempt += 1) {
                ok = await restartCamera();
                if (ok) break;
                await new Promise((r) => window.setTimeout(r, 220 + attempt * 180));
            }
            if (!ok) {
                setVerificationError((prev) =>
                    prev ?? toVerificationError("camera unavailable", mode, "camera")
                );
            }
        };
        void startCamera();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open || step !== "face" || !cameraReady || submitting || verificationError) return;
        if (startedRef.current) return;
        const t = window.setTimeout(() => void handleVerifyAndSubmit(), 450);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, step, cameraReady, submitting, verificationError]);

    const runFaceScanProgress = (): Promise<void> =>
        new Promise((resolve) => {
            const start = Date.now();
            const tick = () => {
                const elapsed = Date.now() - start;
                const pct = Math.min(90, Math.round((elapsed / SCAN_DURATION_MS) * 90));
                setFaceProgress(pct);
                if (elapsed >= SCAN_DURATION_MS) {
                    resolve();
                    return;
                }
                requestAnimationFrame(tick);
            };
            setFaceProgress(0);
            requestAnimationFrame(tick);
        });

    const fetchLocationWithFallback = async (): Promise<{ latitude: number; longitude: number }> => {
        try {
            return await getCurrentLocation({ highAccuracy: true });
        } catch (first) {
            const geo = first as GeolocationPositionError;
            if (geo?.code === 2 || geo?.code === 3) {
                return await getCurrentLocation({ highAccuracy: false });
            }
            throw first;
        }
    };

    const submitAttendance = async (
        image: string,
        latitude: number,
        longitude: number,
    ) => {
        if (!accessToken) throw new Error("Session expired");
        setLocProgress(72);
        const res = mode === "check-in"
            ? await attendanceCheckInRequest(accessToken, { image, latitude, longitude })
            : await attendanceCheckOutRequest(accessToken, {
                image,
                latitude,
                longitude,
                allow_outside_meeting: Boolean(checkoutMeta?.allowOutsideMeeting),
                outside_note: checkoutMeta?.outsideNote || "",
            });
        const rawText = await res.clone().text().catch(() => "");
        const body = (await res.json().catch(() => {
            try {
                return rawText ? JSON.parse(rawText) : {};
            } catch {
                return {};
            }
        })) as {
            error?: string;
            message?: string;
            check_in?: string;
            check_out?: string;
            total_hours?: number;
            overtime_hours?: number;
            detail?: string;
            distance_meters?: number | null;
            face_distance?: number | null;
            threshold?: number | null;
            code?: string;
        };
        if (!res.ok) {
            const errStep = inferApiErrorContext(body, rawText);
            const errInfo = parseVerificationApiError(res.status, body, rawText, mode, errStep);
            const sessionGone = errInfo.title === "Session expired";
            if (sessionGone) {
                toast.error(`${errInfo.title}. ${errInfo.message}`);
                await logout();
                onOpenChange(false);
                window.location.href = "/login";
                throw new AttendanceSubmitError(errInfo);
            }
            if (isFaceVerificationError(errInfo)) {
                lastImageRef.current = null;
            }
            throw new AttendanceSubmitError(errInfo);
        }
        setFaceProgress(100);
        setLocProgress(100);
        setStep("done");
        toast.success(body.message || (mode === "check-in" ? "Check-in successful" : "Check-out successful"), {
            duration: 2200,
        });
        setTimeout(() => {
            onVerified({
                checkInAt: body.check_in,
                checkOutAt: body.check_out,
                totalHours: Number(body.total_hours ?? 0),
                overtimeHours: Number(body.overtime_hours ?? 0),
            });
        }, 1100);
    };

    const runLocationStep = async (image: string) => {
        setStep("location");
        setLocProgress(18);
        const { latitude, longitude } = await fetchLocationWithFallback();
        validateCoordinates(latitude, longitude);
        setCoordsPreview(`${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`);
        setLocProgress(48);
        await submitAttendance(image, latitude, longitude);
    };

    const captureImage = async (): Promise<string> => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) throw new Error("Camera not ready");
        const drawFromVideo = (): string | null => {
            const w = video.videoWidth || 0;
            const h = video.videoHeight || 0;
            if (!w || !h) return null;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Could not capture frame");
            drawFaceFrame(ctx, video, w, h);
            return captureFaceDataUrl(canvas);
        };

        // Attempt 1: standard video-frame capture
        const fromVideo = drawFromVideo();
        if (fromVideo) return fromVideo;

        // Attempt 2: fallback via ImageCapture API when video dims are transiently zero
        try {
            const track = streamRef.current?.getVideoTracks?.()[0];
            const IC = (window as unknown as { ImageCapture?: new (track: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> } }).ImageCapture;
            if (track && IC) {
                const imageCapture = new IC(track);
                const bitmap = await imageCapture.grabFrame();
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext("2d");
                if (!ctx) throw new Error("Could not capture frame");
                ctx.drawImage(bitmap, 0, 0);
                return captureFaceDataUrl(canvas);
            }
        } catch {
            // fall through to final error
        }

        throw new Error("Camera stream not ready");
    };

    const handleVerifyAndSubmit = async () => {
        setVerificationError(null);
        if (!accessToken) { toast.error("Session expired. Please login again."); return; }
        if (!cameraReady) {
            const ready = await restartCamera();
            if (!ready) {
                setVerificationError(
                    toVerificationError("Camera stream not ready", mode, "camera")
                );
                return;
            }
            setCameraReady(true);
        }
        startedRef.current = true;
        setSubmitting(true);
        setFaceProgress(0);
        try {
            await runFaceScanProgress();
            setFaceProgress(92);
            let image = "";
            let lastErr: unknown = null;
            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    image = await captureImage();
                    break;
                } catch (err) {
                    lastErr = err;
                    const msg = typeof (err as { message?: unknown })?.message === "string" ? (err as { message: string }).message : "";
                    if (/camera stream not ready/i.test(msg)) {
                        // progressive recovery: short wait, then restart camera
                        await new Promise((r) => window.setTimeout(r, 220 + attempt * 180));
                        const ready = await restartCamera();
                        if (!ready) continue;
                        await new Promise((r) => window.setTimeout(r, 180));
                        continue;
                    }
                    throw err;
                }
            }
            if (!image) throw (lastErr || new Error("Camera stream not ready"));
            lastImageRef.current = image;
            setFaceProgress(55);
            await runLocationStep(image);
        } catch (e: unknown) {
            if (e instanceof AttendanceSubmitError) {
                setVerificationError(e.errInfo);
                setStep(isLocationVerificationError(e.errInfo) ? "location" : "face");
            } else {
                const geo = e as GeolocationPositionError;
                const msg =
                    geo?.code != null
                        ? geolocationErrorMessage(geo.code)
                        : typeof (e as { message?: unknown })?.message === "string"
                          ? (e as { message: string }).message
                          : "";
                const errInfo = toVerificationError(msg, mode, "location");
                setVerificationError(errInfo);
                setStep("location");
            }
        } finally {
            setSubmitting(false);
            startedRef.current = false;
        }
    };

    const handleRetryScan = async () => {
        if (submitting) return;
        const retryLocationOnly = Boolean(
            lastImageRef.current && isLocationVerificationError(verificationError),
        );
        startedRef.current = false;
        setVerificationError(null);
        warmupGeolocation();

        if (retryLocationOnly && lastImageRef.current) {
            setSubmitting(true);
            setStep("location");
            setLocProgress(8);
            try {
                await runLocationStep(lastImageRef.current);
            } catch (e: unknown) {
                if (e instanceof AttendanceSubmitError) {
                    setVerificationError(e.errInfo);
                    setStep(isLocationVerificationError(e.errInfo) ? "location" : "face");
                } else {
                    const geo = e as GeolocationPositionError;
                    const msg =
                        geo?.code != null
                            ? geolocationErrorMessage(geo.code)
                            : typeof (e as { message?: unknown })?.message === "string"
                              ? (e as { message: string }).message
                              : "location error";
                    setVerificationError(toVerificationError(msg, mode, "location"));
                    setStep("location");
                }
            } finally {
                setSubmitting(false);
                startedRef.current = false;
            }
            return;
        }

        setFaceProgress(0);
        setLocProgress(0);
        setCoordsPreview(null);
        setStep("face");
        const ready = await restartCamera();
        if (!ready) {
            setVerificationError(toVerificationError("camera could not restart", mode, "camera"));
            return;
        }
        await handleVerifyAndSubmit();
    };

    const scanSecondsLeft = submitting
        ? Math.max(1, Math.ceil(((90 - faceProgress) / 90) * (SCAN_DURATION_MS / 1000)))
        : 0;

    const showRetryScan = step === "face" || (step === "location" && Boolean(verificationError));

    const verificationAlert = verificationError ? (
        <motion.div
            key="verification-error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-auto w-full max-w-sm rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3.5 text-left shadow-sm"
            role="alert"
        >
            <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" aria-hidden />
                <div className="min-w-0 space-y-1.5">
                    <p className="text-sm font-semibold text-destructive leading-snug">
                        {verificationError.title}
                    </p>
                    <p className="text-sm text-destructive/90 leading-relaxed">
                        {verificationError.message}
                    </p>
                    {verificationError.tips && verificationError.tips.length > 0 ? (
                        <ul className="text-xs text-destructive/85 space-y-1 pt-0.5 list-disc pl-4">
                            {verificationError.tips.map((tip) => (
                                <li key={tip}>{tip}</li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            </div>
        </motion.div>
    ) : null;

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

                            <AnimatePresence>{verificationAlert}</AnimatePresence>

                            {locationHint && !verificationError ? (
                                <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 mx-auto max-w-sm">
                                    {locationHint}
                                </p>
                            ) : null}
                            {isWfh ? (
                                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                                    WFH: office radius is not required, but location permission is still needed on your phone.
                                </p>
                            ) : null}

                            <div className="relative mx-auto w-52 h-52 sm:w-56 sm:h-56">
                                <div className="absolute inset-0 rounded-full login-verify-ring" />
                                <div className="absolute inset-2 rounded-full overflow-hidden border-2 border-primary/40 bg-muted/20 shadow-sm">
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className="h-full w-full object-cover"
                                        style={{ transform: MIRROR_CAMERA_PREVIEW ? "scaleX(-1)" : "none" }}
                                    />
                                    {submitting && (
                                        <motion.div
                                            className="absolute left-0 right-0 h-0.5 bg-primary/80 shadow-[0_0_16px_hsl(var(--primary))] z-10"
                                            initial={{ top: "12%" }}
                                            animate={{ top: ["12%", "88%", "12%"] }}
                                            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                                        />
                                    )}
                                    {/* Corner focus brackets */}
                                    <span className="pointer-events-none absolute top-3 left-3 h-5 w-5 border-l-2 border-t-2 border-primary/70 rounded-tl-sm" />
                                    <span className="pointer-events-none absolute top-3 right-3 h-5 w-5 border-r-2 border-t-2 border-primary/70 rounded-tr-sm" />
                                    <span className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 border-l-2 border-b-2 border-primary/70 rounded-bl-sm" />
                                    <span className="pointer-events-none absolute bottom-3 right-3 h-5 w-5 border-r-2 border-b-2 border-primary/70 rounded-br-sm" />
                                </div>
                                <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="48" fill="none" stroke="hsl(var(--border))" strokeWidth="2" />
                                    <circle
                                        cx="50" cy="50" r="48" fill="none"
                                        stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round"
                                        strokeDasharray={`${(faceProgress / 100) * 301.6} 301.6`}
                                        className="transition-all duration-150"
                                    />
                                </svg>
                            </div>

                            <div className="flex justify-center gap-2">
                                {[0, 18, 36, 54, 72, 90].map((threshold) => (
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
                                            ? faceProgress < 90
                                                ? `Hold still — scanning (${scanSecondsLeft}s)`
                                                : "Capturing your face..."
                                            : verificationError
                                              ? "Fix the issue below, then tap Retry scan."
                                              : "Center your face in the circle — scan starts automatically."}
                                </p>
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
                                <p className="login-welcome-sub">
                                    {isWfh
                                        ? "Confirming GPS on your device (office radius not required for WFH)."
                                        : "Ensuring you are inside the active office radius."}
                                </p>
                            </div>

                            <AnimatePresence>{verificationAlert}</AnimatePresence>

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
                                {coordsPreview && locProgress >= 30 && locProgress < 100 ? (
                                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] font-mono login-welcome-sub">
                                        {coordsPreview}
                                    </motion.p>
                                ) : null}
                            </div>
                        </motion.div>
                    )}

                    {step === "done" && (
                        <motion.div
                            key="done"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center space-y-4 py-8 relative overflow-hidden"
                        >
                            <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-2">
                                {[
                                    [-55, 95],
                                    [48, 88],
                                    [-20, 102],
                                    [62, 96],
                                    [-40, 78],
                                    [12, 110],
                                    [-70, 85],
                                    [35, 100],
                                    [-8, 92],
                                    [55, 82],
                                    [-32, 105],
                                    [22, 98],
                                    [-58, 90],
                                    [8, 108],
                                ].map(([dx, dy], i) => (
                                    <motion.span
                                        key={i}
                                        className="absolute w-2 h-2 rounded-full bg-primary/85"
                                        initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                                        animate={{
                                            x: dx,
                                            y: dy,
                                            opacity: 0,
                                            scale: 0.15,
                                        }}
                                        transition={{ duration: 0.85, delay: i * 0.04, ease: "easeOut" }}
                                    />
                                ))}
                            </div>
                            <motion.div
                                initial={{ scale: 0, rotate: -20 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: "spring", stiffness: 260, damping: 16 }}
                                className="mx-auto h-20 w-20 rounded-full bg-sage-3d shadow-3d flex items-center justify-center relative z-10"
                            >
                                <motion.div
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ duration: 0.35, delay: 0.12, ease: "easeOut" }}
                                >
                                    <CheckCircle2 className="h-10 w-10 text-white" />
                                </motion.div>
                            </motion.div>
                            <div className="space-y-1 relative z-10">
                                <h2 className="text-2xl font-bold login-welcome">
                                    {mode === "check-in" ? "You're in!" : "Wrapped up!"}
                                </h2>
                                <p className="text-sm login-welcome-sub">
                                    {mode === "check-in"
                                        ? "Face and location verified — enjoy a focused day."
                                        : "Great work today. Rest well."}
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {step !== "done" && (
                    <DialogFooter className="mt-2 sm:mt-4 pt-2 border-t border-border/40 flex-col gap-2 sm:flex-row sm:justify-stretch">
                        <Button
                            variant="outline"
                            className="w-full sm:flex-1"
                            onClick={() => onOpenChange(false)}
                            disabled={submitting && step === "location"}
                        >
                            Cancel
                        </Button>
                        {showRetryScan ? (
                            <Button
                                className="w-full sm:flex-1 bg-sage-3d border-0 text-primary-foreground hover:opacity-90"
                                onClick={() => void handleRetryScan()}
                                disabled={submitting || (step === "face" && !cameraReady)}
                            >
                                {submitting ? "Scanning..." : "Retry scan"}
                            </Button>
                        ) : null}
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
