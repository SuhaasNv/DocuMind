import { useEffect, useState } from "react";

/**
 * True when we should reduce animations for performance/accessibility:
 * - Tablet/mobile viewport (≤1024px) to avoid glitching on iPad, iPhone, Samsung tab
 * - User preference prefers-reduced-motion: reduce
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const motionMql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const widthMql = window.matchMedia("(max-width: 1024px)");

    const update = () => {
      setReduce(motionMql.matches || widthMql.matches);
    };

    update();
    motionMql.addEventListener("change", update);
    widthMql.addEventListener("change", update);
    return () => {
      motionMql.removeEventListener("change", update);
      widthMql.removeEventListener("change", update);
    };
  }, []);

  return reduce;
}
