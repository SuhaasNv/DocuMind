import { motion } from 'framer-motion';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import ConnectClaude from '@/components/landing/ConnectClaude';
import CTA from '@/components/landing/CTA';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Noise overlay for texture */}
      <div className="noise-overlay" />
      
      {/* Navbar */}

      {/* Main content */}
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Hero />
        <Features />
        <ConnectClaude />
        <CTA />
      </motion.main>

      {/* Footer */}
    </div>
  );
};

export default Index;
