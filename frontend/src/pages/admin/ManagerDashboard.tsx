import { Clock, UserCheck, UserX, AlertTriangle, Users, CheckCircle2, Play, Square, Coffee, ScanFace, MapPin, ArrowLeft } from "lucide-react";
import { CheckInModal } from "@/components/CheckInModal";
import { StatCard } from "@/components/StatCard";
import { AttendanceChart } from "@/components/Charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataStore } from "@/store/dataStore";
import { StatusPill } from "@/components/StatusPill";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useAttendanceStore } from "@/store/attendanceStore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function formatDuration(ms: number) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function ManagerDashboard() {
    const { employees, attendance, leaves } = useDataStore();
    const { status, checkInAt, totalBreakMs, breakStartAt, checkIn, startBreak, endBreak, checkOut } = useAttendanceStore();
    const [now, setNow] = useState(Date.now());

    // Verification state
    const [showVerifyModal, setShowVerifyModal] = useState(false);

    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const currentBreak = breakStartAt ? now - breakStartAt : 0;
    const workMs = checkInAt ? now - checkInAt - totalBreakMs - currentBreak : 0;

    const startFaceScan = () => {
        setShowVerifyModal(true);
    };

    const handleVerified = () => {
        setShowVerifyModal(false);
        checkIn();
        toast.success("Checked in successfully");
    };

    const total = employees.length;
    const present = attendance.filter((a) => a.status === "Present").length;
    const absent = attendance.filter((a) => a.status === "Absent").length;
    const late = attendance.filter((a) => a.status === "Late").length;
    const pendingApprovals = leaves.filter((l) => l.status === "Pending").length;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ letterSpacing: '-0.5px' }}>Attendance Overview 📊</h1>
                    <p className="text-sm text-muted-foreground mt-1">Monitor your team's attendance in real-time.</p>
                </div>
            </div>

            {/* Check-in hero card — 3D sage */}
            <Card className="relative overflow-hidden border-0 shadow-3d rounded-3xl min-h-[180px] flex flex-col justify-center">
                <div className="absolute inset-0 bg-sage-3d" />
                <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/15 blur-2xl" />
                <CardContent className="relative p-6 sm:p-8 text-primary-foreground">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key="idle-working"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6"
                        >
                            <div>
                                <p className="text-sm font-medium uppercase tracking-wider text-primary-foreground/80">
                                    {status === "idle" ? "Your personal attendance" : status === "on-break" ? "On break" : "Currently working"}
                                </p>
                                <p className="mt-2 text-4xl sm:text-5xl font-bold tabular-nums tracking-tight">
                                    {formatDuration(workMs)}
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                {status === "idle" ? (
                                    <Button size="lg" onClick={startFaceScan}
                                        className="h-14 px-8 bg-white text-primary hover:bg-white/90 font-semibold shadow-3d animate-pulse-ring rounded-2xl border-0">
                                        <Play className="h-5 w-5 mr-2 fill-primary" /> Check In
                                    </Button>
                                ) : (
                                    <>
                                        <Button size="lg" onClick={() => status === "on-break" ? endBreak() : startBreak()}
                                            className="h-14 px-6 bg-white/20 hover:bg-white/30 text-white border border-white/30 font-semibold backdrop-blur rounded-2xl">
                                            {status === "on-break" ? <><Play className="h-5 w-5 mr-2" /> Resume</> : <><Coffee className="h-5 w-5 mr-2" /> Break</>}
                                        </Button>
                                        <Button size="lg" onClick={checkOut}
                                            className="h-14 px-6 bg-destructive hover:bg-destructive/90 font-semibold shadow-3d rounded-2xl">
                                            <Square className="h-5 w-5 mr-2 fill-current" /> Check Out
                                        </Button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </CardContent>
            </Card>

            {/* Stat cards */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard label="Total Staff" value={total} icon={Users} trend={0} accent="primary" />
                <StatCard label="Present Today" value={present} icon={UserCheck} trend={2.1} accent="success" />
                <StatCard label="Absent" value={absent} icon={UserX} trend={-1.4} accent="warning" />
                <StatCard label="Late Arrivals" value={late} icon={AlertTriangle} trend={-0.5} accent="info" />
                <StatCard label="Pending Approvals" value={pendingApprovals} icon={CheckCircle2} accent="success" />
            </div>

            {/* Attendance chart */}
            <Card className="glass-card-premium border-0">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                        <CardTitle className="text-base">Weekly Attendance</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">Last 7 days trend</p>
                    </div>
                </CardHeader>
                <CardContent>
                    <AttendanceChart />
                </CardContent>
            </Card>

            {/* Live attendance table */}
            <Card className="glass-card-premium border-0">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        Today's Attendance Report
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border/50">
                                    <th className="text-left py-3 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Employee</th>
                                    <th className="text-left py-3 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Department</th>
                                    <th className="text-left py-3 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Check In</th>
                                    <th className="text-left py-3 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Check Out</th>
                                    <th className="text-left py-3 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Hours</th>
                                    <th className="text-left py-3 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {attendance.map((a, i) => (
                                    <motion.tr
                                        key={a.id}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.03 }}
                                        className="border-b border-border/30 hover:bg-muted/30 transition-smooth"
                                    >
                                        <td className="py-3 px-2 font-medium">{a.name}</td>
                                        <td className="py-3 px-2 text-muted-foreground">{a.department}</td>
                                        <td className="py-3 px-2 tabular-nums">{a.checkIn}</td>
                                        <td className="py-3 px-2 tabular-nums">{a.checkOut}</td>
                                        <td className="py-3 px-2 tabular-nums font-medium">{a.hours > 0 ? a.hours.toFixed(1) : "—"}</td>
                                        <td className="py-3 px-2">
                                            <StatusPill
                                                label={a.status}
                                                variant={a.status === "Present" ? "success" : a.status === "Late" ? "warning" : "destructive"}
                                            />
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                        <CheckInModal open={showVerifyModal} onOpenChange={setShowVerifyModal} onVerified={handleVerified} />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
