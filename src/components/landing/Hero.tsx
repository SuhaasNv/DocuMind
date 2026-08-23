import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SplineScene } from '@/components/ui/splite';
import { Spotlight } from '@/components/ui/spotlight';
import { Card } from '@/components/ui/card';
import { useAppStore } from '@/stores/useAppStore';

const Hero = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const sectionRef = useRef<HTMLElement>(null);

  const rawX = useMotionValue(-200);
  const rawY = useMotionValue(-200);
  const blobX = useSpring(rawX, { stiffness: 60, damping: 20, mass: 1 });
  const blobY = useSpring(rawY, { stiffness: 60, damping: 20, mass: 1 });

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      rawX.set(e.clientX - rect.left);
      rawY.set(e.clientY - rect.top);
    };
    el.addEventListener('mousemove', onMove);
    return () => el.removeEventListener('mousemove', onMove);
  }, [rawX, rawY]);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden bg-black"
    >
      <Card className="w-full min-h-[100dvh] bg-black/[0.96] relative overflow-hidden border-0 rounded-none">

        {/* Mouse-following blob — desktop only, pointless on touch */}
        <motion.div
          className="pointer-events-none absolute z-0 hidden md:block"
          style={{
            x: blobX,
            y: blobY,
            translateX: '-50%',
            translateY: '-50%',
            width: 520,
            height: 520,
            borderRadius: '9999px',
            background:
              'radial-gradient(circle at center, rgba(150,150,170,0.18) 0%, rgba(100,120,140,0.10) 40%, transparent 70%)',
            filter: 'blur(48px)',
          }}
        />

        <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="white" />

        {/* ── Two-column layout: stacks on mobile, side-by-side on md+ ── */}
        <div className="flex flex-col md:flex-row min-h-[100dvh]">

          {/* LEFT — text content */}
          <div className="flex-1 flex flex-col justify-center relative z-10
                          px-6 pt-28 pb-10
                          sm:px-10 sm:pt-32 sm:pb-12
                          md:px-16 md:pt-0 md:pb-0">

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.1 }}
              className="font-bold leading-tight mb-5
                         text-3xl sm:text-4xl md:text-5xl lg:text-6xl
                         bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400"
            >
              Chat with your
              <br />
              documents.{' '}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
                Instantly.
              </span>
            </motion.h1>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.2 }}
              className="text-neutral-400 text-sm sm:text-base md:text-lg mb-8 leading-relaxed max-w-md"
            >
              Upload PDFs and let AI understand them for you. Ask questions,
              get answers grounded in your documents. No hallucinations, just
              facts.
            </motion.p>

            {/* CTA buttons — full-width on mobile, auto on sm+ */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto"
            >
              <Link to={isAuthenticated ? '/app' : '/register'} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-white text-black hover:bg-neutral-200 font-semibold px-6 active:scale-[0.97] transition-transform"
                >
                  {isAuthenticated ? 'Open Dashboard' : 'Get Started Free'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link to="/how-it-works" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto border-white/20 text-neutral-300 hover:bg-white/10 hover:text-white px-6 active:scale-[0.97] transition-transform"
                >
                  See How It Works
                </Button>
              </Link>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.55, delay: 0.5 }}
              className="mt-10 pt-8 border-t border-white/10 grid grid-cols-3 gap-4 sm:flex sm:flex-row sm:gap-8"
            >
              {[
                { label: 'Documents Processed', value: '50K+' },
                { label: 'Accuracy Rate',        value: '99.2%' },
                { label: 'Teams Using Insight',  value: '1,200+' },
              ].map((stat) => (
                <div key={stat.label} className="text-center sm:text-left">
                  <p className="text-lg sm:text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-[10px] sm:text-sm text-neutral-500 mt-0.5 leading-tight">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* RIGHT — Spline scene, hidden on mobile to save bandwidth & layout */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="hidden md:flex flex-1 relative min-h-[400px]"
          >
            <SplineScene
              scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
              className="w-full h-full"
            />
          </motion.div>

        </div>
      </Card>
    </section>
  );
};

export default Hero;
