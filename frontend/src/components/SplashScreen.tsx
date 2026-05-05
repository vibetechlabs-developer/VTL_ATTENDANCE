import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function SplashScreen({ children }: { children: React.ReactNode }) {
    const [show, setShow] = useState(() => {
        if (sessionStorage.getItem("vtl-splash-shown")) return false;
        return true;
    });

    useEffect(() => {
        if (!show) return;
        const timer = setTimeout(() => {
            setShow(false);
            sessionStorage.setItem("vtl-splash-shown", "1");
        }, 2800);
        return () => clearTimeout(timer);
    }, [show]);

    return (
        <>
            <AnimatePresence>
                {show && (
                    <motion.div
                        key="splash"
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6, ease: "easeInOut" }}
                        className="fixed inset-0 z-[9999] flex items-center justify-center bg-background overflow-hidden"
                    >
                        {/* Animated gradient orbs */}
                        <div className="absolute inset-0 pointer-events-none">
                            <motion.div
                                className="absolute w-[500px] h-[500px] rounded-full"
                                style={{ background: "radial-gradient(circle, hsl(140 40% 60% / 0.3), transparent 70%)", top: "-10%", left: "-10%" }}
                                animate={{ x: [0, 60, 0], y: [0, 40, 0], scale: [1, 1.2, 1] }}
                                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                            />
                            <motion.div
                                className="absolute w-[400px] h-[400px] rounded-full"
                                style={{ background: "radial-gradient(circle, hsl(22 70% 80% / 0.25), transparent 70%)", bottom: "-15%", right: "-5%" }}
                                animate={{ x: [0, -40, 0], y: [0, -30, 0], scale: [1, 1.15, 1] }}
                                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                            />
                            <motion.div
                                className="absolute w-[300px] h-[300px] rounded-full"
                                style={{ background: "radial-gradient(circle, hsl(210 55% 80% / 0.2), transparent 70%)", top: "40%", right: "20%" }}
                                animate={{ x: [0, 30, 0], y: [0, -50, 0], scale: [1, 1.1, 1] }}
                                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                            />
                        </div>

                        {/* Logo & text */}
                        <div className="relative flex flex-col items-center gap-6">
                            <motion.div
                                initial={{ scale: 0.3, opacity: 0, rotateY: -90 }}
                                animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                className="relative"
                            >
                                {/* Glow behind logo */}
                                <motion.div
                                    className="absolute inset-0 rounded-3xl"
                                    style={{ boxShadow: "0 0 80px 30px hsl(140 40% 50% / 0.3)" }}
                                    animate={{ opacity: [0.4, 0.8, 0.4] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                />
                                <img
                                    src="/vtl-logo.svg"
                                    alt="Vibe Tech Labs"
                                    className="h-24 w-24 rounded-3xl shadow-3d relative z-10"
                                />
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5, duration: 0.6 }}
                                className="text-center"
                            >
                                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                                    Vibe Tech Labs
                                </h1>
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1, duration: 0.5 }}
                                    className="text-sm text-muted-foreground mt-2 tracking-wide"
                                >
                                    Smart Attendance & Workforce CRM
                                </motion.p>
                            </motion.div>

                            {/* Loading indicator */}
                            <motion.div
                                initial={{ opacity: 0, scaleX: 0 }}
                                animate={{ opacity: 1, scaleX: 1 }}
                                transition={{ delay: 1.2, duration: 0.4 }}
                                className="w-40 h-1 rounded-full overflow-hidden bg-muted mt-2"
                            >
                                <motion.div
                                    className="h-full rounded-full bg-sage-3d"
                                    initial={{ width: "0%" }}
                                    animate={{ width: "100%" }}
                                    transition={{ delay: 1.4, duration: 1.2, ease: "easeInOut" }}
                                />
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {children}
        </>
    );
}
