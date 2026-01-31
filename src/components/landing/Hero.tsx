import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BubbleBackground } from '@/components/ui/bubble-background';
import { useAppStore } from '@/stores/useAppStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const COMPANIES = [
  'Acme Corp',
  'TechStart',
  'DataFlow',
  'CloudSync',
  'DocuLabs',
  'Paperwise',
  'Nexus AI',
  'Summit Legal',
  'VaultDocs',
  'InsightIQ',
  'ByteForge',
  'ScaleUp',
];

const Hero = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative min-h-screen min-h-[100dvh] flex flex-col items-center justify-start sm:justify-center overflow-hidden pt-safe pb-[max(5rem,calc(4rem+env(safe-area-inset-bottom,0px)))] sm:pt-0 sm:pb-0">
      {/* Animated bubble background – simplified on tablet/mobile to avoid glitching */}
      <BubbleBackground className="absolute inset-0" interactive={!reduceMotion} reduceMotion={reduceMotion} />

      {/* Overlay gradient for content readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
      
      {/* Top gradient glow */}
      <div className="absolute inset-0 hero-gradient" />
      
      {/* Animated gradient orbs – hidden on tablet/mobile for smoother performance */}
      {!reduceMotion && (
        <>
          <motion.div
            className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl"
            animate={{
              x: [0, 50, 0],
              y: [0, 30, 0],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/15 rounded-full blur-3xl"
            animate={{
              x: [0, -40, 0],
              y: [0, -20, 0],
              scale: [1, 1.15, 1],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            }}
          />
        </>
      )}

      {/* Content: on mobile add top padding so badge sits below fixed navbar; on sm+ centered */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6 text-center overflow-hidden w-full flex flex-col items-center pt-[calc(6rem+env(safe-area-inset-top,0px))] sm:pt-0">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-4 sm:mb-6 shrink-0"
        >
          <span className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 rounded-full bg-primary/10 border border-primary/20 text-primary text-mobile-safe font-medium text-center">
            <Sparkles className="w-4 h-4 shrink-0" />
            AI-Powered Document Intelligence
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-3xl xs:text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 max-w-none"
        >
          Chat with your documents.
          <br />
          <span className="gradient-text">Instantly.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10 text-mobile-safe"
        >
          Upload PDFs, and let AI understand them for you. Ask questions, get answers 
          grounded in your documents — no hallucinations, just facts.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, ...(reduceMotion ? {} : { y: 20 }) }}
          animate={{ opacity: 1, ...(reduceMotion ? {} : { y: 0 }) }}
          transition={{ duration: reduceMotion ? 0.2 : 0.6, delay: reduceMotion ? 0 : 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <Link to={isAuthenticated ? '/app' : '/register'}>
            <Button variant="hero" size="xl">
              {isAuthenticated ? 'Documents' : 'Get Started'}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <Link to="#features">
            <Button variant="heroOutline" size="xl">
              See How It Works
            </Button>
          </Link>
        </motion.div>

        {/* Social proof – slow horizontal marquee, fixed in the middle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0.2 : 0.6, delay: reduceMotion ? 0 : 0.5 }}
          className="mt-16 pt-8 border-t border-border/30 w-full flex flex-col items-center"
        >
          <p className="text-sm text-muted-foreground mb-4">
            Trusted by teams at
          </p>
          <div className="overflow-hidden w-full max-w-xl mx-auto" aria-hidden="true">
            <div className="flex w-max animate-marquee-horizontal gap-8 opacity-50">
              {[...COMPANIES, ...COMPANIES].map((company, i) => (
                <span key={`${company}-${i}`} className="text-lg font-semibold text-muted-foreground whitespace-nowrap shrink-0">
                  {company}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
