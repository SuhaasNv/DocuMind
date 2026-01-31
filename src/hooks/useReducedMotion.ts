import { useEffect, useState } from "react";

/** Breakpoint (px): use reduced motion for tablet/mobile and tablet landscape (e.g. Samsung Tab S9). */
const REDUCE_MOTION_MAX_WIDTH = 1280;

function getReduceMotionInitial(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia(`(max-width: ${REDUCE_MOTION_MAX_WIDTH}px)`).matches
  );
}

/**
 * True when we should reduce animations for performance/accessibility:
 * - Tablet/mobile and tablet landscape (≤1280px) to avoid flicker on iPad, Samsung Tab S9, etc.
 * - User preference prefers-reduced-motion: reduce
 * Initial state is set synchronously to avoid flash/flicker on load.
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(getReduceMotionInitial);

  useEffect(() => {
    const motionMql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const widthMql = window.matchMedia(`(max-width: ${REDUCE_MOTION_MAX_WIDTH}px)`);

    const update = () => {
      setReduce(motionMql.matches || widthMql.matches);
    };

    motionMql.addEventListener("change", update);
    widthMql.addEventListener("change", update);
    return () => {
      motionMql.removeEventListener("change", update);
      widthMql.removeEventListener("change", update);
    };
  }, []);

  return reduce;
}
