import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
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
    <section ref={sectionRef} className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black pt-20">
      <Card className="w-full min-h-screen bg-black/[0.96] relative overflow-hidden border-0 rounded-none">
        {/* Mouse-following gradient blob */}
        <motion.div
          className="pointer-events-none absolute z-0"
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

        <Spotlight
          className="-top-40 left-0 md:left-60 md:-top-20"
          fill="white"
        />

        <div className="flex flex-col md:flex-row h-full min-h-[calc(100vh-4rem)]">
          {/* Left content */}
          <div className="flex-1 p-8 md:p-16 relative z-10 flex flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-6"
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-neutral-300 text-sm font-medium">
                <Sparkles className="w-4 h-4 shrink-0 text-white" />
                AI-Powered Document Intelligence
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl md:text-5xl lg:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 mb-6 leading-tight"
            >
              Chat with your
              <br />
              documents.{' '}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
                Instantly.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-neutral-400 max-w-lg text-base md:text-lg mb-10 leading-relaxed"
            >
              Upload PDFs and let AI understand them for you. Ask questions,
              get answers grounded in your documents — no hallucinations, just
              facts.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Link to={isAuthenticated ? '/app' : '/register'}>
                <Button
                  size="lg"
                  className="bg-white text-black hover:bg-neutral-200 font-semibold px-8"
                >
                  {isAuthenticated ? 'Open Dashboard' : 'Get Started Free'}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link to="/how-it-works">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/20 text-neutral-300 hover:bg-white/10 hover:text-white px-8"
                >
                  See How It Works
                </Button>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-12 pt-8 border-t border-white/10 flex flex-wrap gap-8"
            >
              {[
                { label: 'Documents Processed', value: '50K+' },
                { label: 'Accuracy Rate', value: '99.2%' },
                { label: 'Teams Using Insight', value: '1,200+' },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-sm text-neutral-500 mt-1">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right content — 3D Spline scene */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="flex-1 relative min-h-[400px] md:min-h-0"
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
