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
                                {/* Uses inline base64 logo to avoid static file copy */}
                                <img
                                    src="data:image/png;base64,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"
                                    alt="Vibe Tech Labs"
                                    className="h-24 w-24 rounded-3xl shadow-3d relative z-10 object-cover object-left"
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
