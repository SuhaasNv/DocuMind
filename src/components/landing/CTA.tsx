import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const CTA = () => {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/20 rounded-full blur-3xl opacity-50" />
      </div>

      <div className="relative z-10 container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to unlock your
            <span className="gradient-text"> document intelligence?</span>
          </h2>
          <p className="text-xl text-muted-foreground mb-10">
            Join thousands of professionals who use AI to extract insights from their documents in seconds.
          </p>
          <Link to="/register">
            <Button variant="hero" size="xl" className="animate-pulse-glow">
              Start for Free
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            No credit card required • Free forever tier available
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default CTA;
