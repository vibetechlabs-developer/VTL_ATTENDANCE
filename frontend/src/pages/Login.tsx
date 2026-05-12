import { useEffect, useRef, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, ScanFace,
  MapPin, CheckCircle2, Loader2, ArrowLeft, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore, Role, profileToAuthUser, type MeProfilePayload } from "@/store/authStore";
import { loginRequest, meRequest } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";

type Step = "creds" | "face" | "location" | "done";

/* ──── Canvas Particle System (dark theme only) ──── */
function useParticleCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>, containerRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const resize = () => {
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
    };
    resize();

    const dots: { x: number; y: number; r: number; vx: number; vy: number; o: number; pulse: number }[] = [];
    const isMobile = window.innerWidth < 768;
    const particleCount = isMobile ? 50 : 90;
    for (let i = 0; i < particleCount; i++) {
      dots.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.8 + 0.3,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        o: Math.random() * 0.5 + 0.1,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    const lines: { x: number; y: number; len: number; angle: number; va: number; vx: number; vy: number; o: number }[] = [];
    for (let i = 0; i < 14; i++) {
      lines.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        len: Math.random() * 70 + 35,
        angle: Math.random() * Math.PI * 2,
        va: (Math.random() - 0.5) * 0.004,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        o: Math.random() * 0.1 + 0.03,
      });
    }

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      lines.forEach((l) => {
        l.angle += l.va;
        l.x += l.vx;
        l.y += l.vy;
        if (l.x < -80) l.x = canvas.width + 80;
        if (l.x > canvas.width + 80) l.x = -80;
        if (l.y < -80) l.y = canvas.height + 80;
        if (l.y > canvas.height + 80) l.y = -80;
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.angle);
        const g = ctx.createLinearGradient(-l.len / 2, 0, l.len / 2, 0);
        g.addColorStop(0, "rgba(29,158,117,0)");
        g.addColorStop(0.5, `rgba(29,158,117,${l.o})`);
        g.addColorStop(1, "rgba(29,158,117,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-l.len / 2, 0);
        ctx.lineTo(l.len / 2, 0);
        ctx.stroke();
        ctx.restore();
      });

      dots.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += 0.025;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        const alpha = p.o * (0.7 + 0.3 * Math.sin(p.pulse));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(29,158,117,${alpha})`;
        ctx.fill();
      });

      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x;
          const dy = dots[i].y - dots[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(dots[i].x, dots[i].y);
            ctx.lineTo(dots[j].x, dots[j].y);
            ctx.strokeStyle = `rgba(29,158,117,${0.06 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    }

    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [canvasRef, containerRef]);
}

export default function Login() {
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("creds");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [faceProgress, setFaceProgress] = useState(0);
  const [locProgress, setLocProgress] = useState(0);
  const [redirectTo, setRedirectTo] = useState("/admin");
  const faceTimer = useRef<number | null>(null);
  const locTimer = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<HTMLDivElement | null>(null);

  useParticleCanvas(canvasRef, sceneRef);

  const handleCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await loginRequest(email, password);
      const data = (await res.json().catch(() => ({}))) as { error?: string; access?: string; refresh?: string; notice?: string | null };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Login failed");
        return;
      }
      const access = data.access;
      const refresh = data.refresh;
      if (!access || !refresh) {
        toast.error("Invalid response from server");
        return;
      }
      const meRes = await meRequest(access);
      const meBody = await meRes.json().catch(() => ({}));
      if (!meRes.ok) {
        toast.error(typeof (meBody as { error?: string }).error === "string" ? (meBody as { error: string }).error : "Could not load profile");
        return;
      }
      const authUser = profileToAuthUser(meBody as MeProfilePayload);
      setSession(authUser, access, refresh);
      if (data.notice) {
        toast.warning(data.notice);
      }
      setRedirectTo(authUser.role === "employee" || authUser.role === "hr" || authUser.role === "manager" ? "/employee" : "/admin");
      setStep("face");
      runFaceScan();
    } finally {
      setLoading(false);
    }
  };

  const runFaceScan = () => {
    setFaceProgress(0);
    if (faceTimer.current) window.clearInterval(faceTimer.current);
    faceTimer.current = window.setInterval(() => {
      setFaceProgress((p) => {
        if (p >= 100) {
          window.clearInterval(faceTimer.current!);
          setTimeout(() => {
            setStep("location");
            runLocation();
          }, 400);
          return 100;
        }
        return p + 4;
      });
    }, 70);
  };

  const runLocation = () => {
    setLocProgress(0);
    if (locTimer.current) window.clearInterval(locTimer.current);
    locTimer.current = window.setInterval(() => {
      setLocProgress((p) => {
        if (p >= 100) {
          window.clearInterval(locTimer.current!);
            setTimeout(() => {
              setStep("done");
              setTimeout(() => {
                toast.success("Welcome! You're signed in.");
                navigate(redirectTo, { replace: true });
              }, 700);
            }, 400);
          return 100;
        }
        return p + 5;
      });
    }, 70);
  };

  useEffect(() => () => {
    if (faceTimer.current) window.clearInterval(faceTimer.current);
    if (locTimer.current) window.clearInterval(locTimer.current);
  }, []);

  if (user) {
    return <Navigate to={user.role === "employee" || user.role === "hr" || user.role === "manager" ? "/employee" : "/admin"} replace />;
  }

  return (
    <div
      ref={sceneRef}
      className="login-scene relative flex min-h-dvh w-full flex-col items-center justify-center overflow-y-auto p-4 sm:p-6 lg:p-8"
    >
      {/* Canvas particles */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full z-0"
      />

      {/* Aurora blobs */}
      <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden opacity-50 dark:opacity-100">
        <div className="login-aurora-blob login-a1" />
        <div className="login-aurora-blob login-a2" />
        <div className="login-aurora-blob login-a3" />
      </div>

      {/* Grid overlay */}
      <div className="absolute inset-0 z-[1] pointer-events-none login-grid-bg opacity-30 dark:opacity-100" />

      {/* Theme toggle */}
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex w-full max-w-5xl shrink-0 justify-center self-center px-0 sm:px-1">
        <div className="login-container relative flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl border-glow-shine bg-card shadow-2xl lg:h-full lg:max-h-[min(640px,90dvh)] lg:flex-row">
        {/* ─── Left Brand Panel ─── */}
        <div className="login-left-panel relative z-[3] hidden flex-1 flex-col items-center justify-between px-8 py-8 text-center sm:px-10 lg:flex lg:px-12 lg:py-10">
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-center gap-3"
          >
            <div className="login-logo-3d shrink-0 overflow-hidden">
              <img src="/vtl-logo-transparent.png" alt="" className="relative z-10" />
            </div>
            <div className="text-left">
              <span className="font-bold text-[16px] block leading-tight login-brand-name">Vibe Tech Labs</span>
              <span className="text-[11px] login-brand-sub">A Digital Idea To Grow You Up</span>
            </div>
          </motion.div>

          {/* Hero */}
          <div className="flex w-full max-w-lg flex-1 flex-col items-center justify-center py-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="login-badge mx-auto"
            >
              <span className="login-badge-dot" />
              <Sparkles className="h-3 w-3" />
              Smart Attendance & Workforce CRM
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="login-headline text-balance"
            >
              Calm attendance.<br />
              <em>Happier workforce.</em>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="login-subtext mx-auto text-balance"
            >
              Face check-in, geo-verified at the VTL office, zero friction. A serene CRM for HR, managers and teams.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="flex flex-wrap justify-center gap-2"
            >
              {["Face check-in", "Geo verified", "Smart leaves", "Live analytics"].map((f) => (
                <span key={f} className="login-tag">{f}</span>
              ))}
            </motion.div>
          </div>

          {/* Footer */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="login-footer-text w-full pt-2 text-center"
          >
            © 2026 Vibe Tech Labs. All rights reserved.
          </motion.p>
        </div>

        {/* ─── Right Panel — Login card ─── */}
        <div className="login-right-panel relative z-[3] flex w-full flex-col items-center justify-center px-6 py-8 sm:px-8 lg:px-9 lg:py-7">
          {/* Glass panel background (dark) */}
          <div className="login-glass-panel" />
          <div className="login-glass-shine" />

          <div className="relative z-[1] mx-auto w-full max-w-[400px] px-1 sm:px-0">
            <AnimatePresence mode="wait">
              {step === "creds" && (
                <motion.div
                  key="creds"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  className="space-y-4"
                >
                  {/* Mobile logo */}
                  <div className="flex items-center justify-center gap-2.5 lg:hidden mb-1">
                    <div className="login-logo-3d login-logo-3d-sm shrink-0 overflow-hidden">
                      <img src="/vtl-logo-transparent.png" alt="" className="relative z-10" />
                    </div>
                    <span className="font-bold text-base login-brand-name">Vibe Tech Labs</span>
                  </div>

                  <div className="space-y-1 text-center sm:text-left">
                    <h2 className="login-welcome">Welcome back</h2>
                    <p className="login-welcome-sub">Sign in with your email and password.</p>
                  </div>

                  <form onSubmit={handleCreds} className="space-y-3 text-left">
                    <div className="space-y-1">
                      <Label htmlFor="email" className="login-label">Email</Label>
                      <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="login-input" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="password" className="login-label">Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="login-input pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="no-hover-lift absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <Button type="submit" disabled={loading} className="login-btn w-full">
                      {loading ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing in...</>
                      ) : (
                        "Continue"
                      )}
                    </Button>
                  </form>
                </motion.div>
              )}

              {step === "face" && (
                <motion.div
                  key="face"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  className="space-y-5 text-center"
                >
                  <button onClick={() => setStep("creds")} className="login-back-btn">
                    <ArrowLeft className="h-3 w-3" /> Back
                  </button>
                  <div className="space-y-1">
                    <h2 className="login-welcome">Face verification</h2>
                    <p className="login-welcome-sub">Look at the camera. We'll match in a moment.</p>
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

                  {/* Biometric mapping dots */}
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
                      {faceProgress < 30 ? "Detecting face..." : faceProgress < 60 ? "Mapping biometric points..." : faceProgress < 100 ? "Matching with VTL records..." : "✓ Verified"}
                    </p>
                  </div>
                </motion.div>
              )}

              {step === "location" && (
                <motion.div
                  key="location"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  className="space-y-5 text-center"
                >
                  <div className="space-y-1">
                    <h2 className="login-welcome">Location check</h2>
                    <p className="login-welcome-sub">Confirming you're at the VTL office.</p>
                  </div>

                  <div className="relative mx-auto w-44 h-44">
                    <div className="absolute inset-0 rounded-3xl login-verify-ring" />
                    <div className="absolute inset-2 rounded-3xl login-verify-inner flex items-center justify-center">
                      <motion.div
                        animate={{ scale: [1, 1.15, 1] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                      >
                        <MapPin className="h-16 w-16 text-primary" />
                      </motion.div>
                    </div>
                    {/* Pulsing ring */}
                    <motion.div
                      className="absolute inset-0 rounded-3xl border-2 border-primary/30"
                      animate={{ scale: [1, 1.15], opacity: [0.6, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  </div>

                  <div className="space-y-2 px-4">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: "linear-gradient(90deg, #1D9E75, #25d499)" }}
                        animate={{ width: `${locProgress}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>
                    <p className="text-xs login-welcome-sub">
                      {locProgress < 30 ? "Pinging GPS..." : locProgress < 60 ? "Resolving coordinates..." : locProgress < 100 ? "VTL HQ · Ahmedabad, IN" : "✓ Inside VTL geofence"}
                    </p>
                    {locProgress >= 30 && locProgress < 100 && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[11px] font-mono login-welcome-sub"
                      >
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
                  className="text-center space-y-4 py-6"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="mx-auto h-16 w-16 rounded-full bg-sage-3d shadow-3d flex items-center justify-center"
                  >
                    <CheckCircle2 className="h-8 w-8 text-white" />
                  </motion.div>
                  <h2 className="text-xl font-bold login-welcome">All set!</h2>
                  <p className="text-sm login-welcome-sub">Taking you to your dashboard…</p>

                  {/* Session details card */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="login-demo-box text-left space-y-1.5 mt-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider login-demo-title">Session Info</span>
                      <span className="login-demo-badge">secured</span>
                    </div>
                    <div className="text-xs login-welcome-sub flex justify-between">
                      <span>Office</span>
                      <span className="font-medium login-brand-name">VTL HQ, Ahmedabad</span>
                    </div>
                    <div className="text-xs login-welcome-sub flex justify-between">
                      <span>Date</span>
                      <span className="font-medium login-brand-name">{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                    <div className="text-xs login-welcome-sub flex justify-between">
                      <span>Check-in</span>
                      <span className="font-medium login-brand-name">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="login-protected mt-3 text-center text-xs sm:text-left">Sessions use JWT from the API · sign out clears tokens locally</p>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
