import { motion, type SpringOptions, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface BubbleBackgroundProps {
  className?: string;
  children?: React.ReactNode;
  interactive?: boolean;
  /** When true, use a lightweight CSS-only background (no goo filter, fewer bubbles) for smoother performance on tablets/phones. */
  reduceMotion?: boolean;
  transition?: SpringOptions;
  colors?: {
    first: string;
    second: string;
    third: string;
    fourth: string;
    fifth: string;
    sixth: string;
  };
}

/** DocuMind palette: teal/cyan only (RGB strings for rgba). */
const DOCUMIND_BUBBLE_COLORS = {
  first: "29, 184, 171",   // primary teal hsl(175 80% 45%)
  second: "20, 163, 184",  // blue-teal hsl(190 80% 40%)
  third: "13, 217, 233",   // bright cyan
  fourth: "36, 143, 134",  // accent/darker teal
  fifth: "32, 107, 100",   // muted teal
  sixth: "37, 206, 206",   // soft cyan
};

export function BubbleBackground({
  className,
  children,
  interactive = false,
  reduceMotion = false,
  transition = { stiffness: 100, damping: 20 },
  colors = DOCUMIND_BUBBLE_COLORS,
}: BubbleBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, transition);
  const springY = useSpring(mouseY, transition);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      mouseX.set(e.clientX - centerX);
      mouseY.set(e.clientY - centerY);
    },
    [mouseX, mouseY]
  );

  useEffect(() => {
    if (!interactive || reduceMotion) return;
    const onMove = (e: MouseEvent) => handleMouseMove(e);
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [interactive, reduceMotion, handleMouseMove]);

  const makeGradient = (color: string) =>
    `radial-gradient(circle at center, rgba(${color}, 0.8) 0%, rgba(${color}, 0) 50%)`;

  /* Lightweight mode for tablet/mobile: no goo filter, 3 CSS-animated blobs only */
  if (reduceMotion) {
    return (
      <div
        ref={containerRef}
        className={cn(
          "absolute inset-0 overflow-hidden bg-gradient-to-br from-background via-[hsl(220,20%,5%)] to-[hsl(220,25%,3%)]",
          className
        )}
      >
        <div
          className="absolute inset-0"
          style={{ filter: "blur(60px)", WebkitFilter: "blur(60px)" }}
        >
          <div
            className="absolute rounded-full bubble-soft-a mix-blend-hard-light opacity-50"
            style={{
              width: "85%",
              height: "85%",
              top: "5%",
              left: "5%",
              background: makeGradient(colors.first),
            }}
          />
          <div
            className="absolute rounded-full bubble-soft-b mix-blend-hard-light opacity-40"
            style={{
              width: "80%",
              height: "80%",
              top: "30%",
              right: "0",
              left: "auto",
              background: makeGradient(colors.third),
            }}
          />
          <div
            className="absolute rounded-full bubble-soft-c mix-blend-hard-light opacity-40"
            style={{
              width: "75%",
              height: "75%",
              bottom: "10%",
              left: "10%",
              top: "auto",
              background: makeGradient(colors.fifth),
            }}
          />
        </div>
        {children != null && (
          <div className="relative z-10 h-full w-full">{children}</div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-0 overflow-hidden bg-gradient-to-br from-background via-[hsl(220,20%,5%)] to-[hsl(220,25%,3%)]",
        className
      )}
    >
      <svg className="absolute w-0 h-0 overflow-hidden" aria-hidden="true">
        <defs>
          <filter id="bubble-goo">
            <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="10" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              result="goo"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      <div
        className="absolute inset-0"
        style={{ filter: "url(#bubble-goo) blur(40px)" }}
      >
        <motion.div
          className="absolute rounded-full mix-blend-hard-light"
          style={{
            width: "80%",
            height: "80%",
            top: "10%",
            left: "10%",
            background: makeGradient(colors.first),
          }}
          animate={{ y: [-50, 50, -50] }}
          transition={{ duration: 30, ease: "easeInOut", repeat: Infinity }}
        />

        <motion.div
          className="absolute inset-0 flex justify-center items-center"
          style={{ transformOrigin: "calc(50% - 400px) center" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 20, ease: "linear", repeat: Infinity }}
        >
          <div
            className="rounded-full mix-blend-hard-light"
            style={{
              width: "80%",
              height: "80%",
              background: makeGradient(colors.second),
            }}
          />
        </motion.div>

        <motion.div
          className="absolute inset-0 flex justify-center items-center"
          style={{ transformOrigin: "calc(50% + 400px) center" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 40, ease: "linear", repeat: Infinity }}
        >
          <div
            className="absolute rounded-full mix-blend-hard-light"
            style={{
              width: "80%",
              height: "80%",
              top: "calc(50% + 200px)",
              left: "calc(50% - 500px)",
              background: makeGradient(colors.third),
            }}
          />
        </motion.div>

        <motion.div
          className="absolute rounded-full mix-blend-hard-light opacity-70"
          style={{
            width: "80%",
            height: "80%",
            top: "10%",
            left: "10%",
            background: makeGradient(colors.fourth),
          }}
          animate={{ x: [-50, 50, -50] }}
          transition={{ duration: 40, ease: "easeInOut", repeat: Infinity }}
        />

        <motion.div
          className="absolute inset-0 flex justify-center items-center"
          style={{ transformOrigin: "calc(50% - 800px) calc(50% + 200px)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 20, ease: "linear", repeat: Infinity }}
        >
          <div
            className="absolute rounded-full mix-blend-hard-light"
            style={{
              width: "160%",
              height: "160%",
              top: "calc(50% - 80%)",
              left: "calc(50% - 80%)",
              background: makeGradient(colors.fifth),
            }}
          />
        </motion.div>

        {/* Extra bubbles – varied positions and motion */}
        <motion.div
          className="absolute rounded-full mix-blend-hard-light opacity-60"
          style={{
            width: "70%",
            height: "70%",
            top: "60%",
            left: "5%",
            background: makeGradient(colors.first),
          }}
          animate={{ y: [30, -40, 30], x: [20, -30, 20] }}
          transition={{ duration: 25, ease: "easeInOut", repeat: Infinity }}
        />
        <motion.div
          className="absolute rounded-full mix-blend-hard-light opacity-50"
          style={{
            width: "60%",
            height: "60%",
            top: "15%",
            right: "5%",
            left: "auto",
            background: makeGradient(colors.third),
          }}
          animate={{ y: [-30, 25, -30], scale: [1, 1.08, 1] }}
          transition={{ duration: 22, ease: "easeInOut", repeat: Infinity }}
        />
        <motion.div
          className="absolute inset-0 flex justify-center items-center"
          style={{ transformOrigin: "calc(50% + 600px) calc(50% - 300px)" }}
          animate={{ rotate: -360 }}
          transition={{ duration: 35, ease: "linear", repeat: Infinity }}
        >
          <div
            className="absolute rounded-full mix-blend-hard-light opacity-60"
            style={{
              width: "90%",
              height: "90%",
              top: "calc(50% - 45%)",
              left: "calc(50% - 45%)",
              background: makeGradient(colors.second),
            }}
          />
        </motion.div>
        <motion.div
          className="absolute rounded-full mix-blend-hard-light opacity-55"
          style={{
            width: "65%",
            height: "65%",
            bottom: "20%",
            right: "15%",
            top: "auto",
            left: "auto",
            background: makeGradient(colors.fourth),
          }}
          animate={{ x: [-40, 35, -40], y: [-20, 25, -20] }}
          transition={{ duration: 28, ease: "easeInOut", repeat: Infinity }}
        />
        <motion.div
          className="absolute rounded-full mix-blend-hard-light opacity-45"
          style={{
            width: "50%",
            height: "50%",
            top: "40%",
            left: "30%",
            background: makeGradient(colors.fifth),
          }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.45, 0.7, 0.45] }}
          transition={{ duration: 18, ease: "easeInOut", repeat: Infinity }}
        />
        <motion.div
          className="absolute inset-0 flex justify-center items-center"
          style={{ transformOrigin: "calc(50% - 200px) calc(50% + 400px)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 45, ease: "linear", repeat: Infinity }}
        >
          <div
            className="absolute rounded-full mix-blend-hard-light opacity-50"
            style={{
              width: "70%",
              height: "70%",
              top: "calc(50% + 150px)",
              left: "calc(50% - 200px)",
              background: makeGradient(colors.third),
            }}
          />
        </motion.div>

        {interactive && (
          <motion.div
            className="absolute rounded-full mix-blend-hard-light opacity-70 pointer-events-none"
            style={{
              width: "100%",
              height: "100%",
              background: makeGradient(colors.sixth),
              x: springX,
              y: springY,
            }}
          />
        )}
      </div>

      {children != null && (
        <div className="relative z-10 h-full w-full">{children}</div>
      )}
    </div>
  );
}

export default BubbleBackground;
