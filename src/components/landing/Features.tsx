import { motion } from 'framer-motion';
import { Upload, Zap, MessageSquare, Shield, Brain, Clock } from 'lucide-react';

const features = [
  {
    icon: Upload,
    title: 'Upload PDFs',
    description: 'Simply drag and drop your documents. We support PDF files of any size.',
  },
  {
    icon: Zap,
    title: 'Real-time Processing',
    description: 'Watch as your documents are processed in real-time with live progress updates.',
  },
  {
    icon: MessageSquare,
    title: 'AI Chat',
    description: 'Ask questions naturally and get accurate answers grounded in your documents.',
  },
  {
    icon: Shield,
    title: 'Secure & Private',
    description: 'Your documents are encrypted and never shared. Enterprise-grade security.',
  },
  {
    icon: Brain,
    title: 'RAG Technology',
    description: 'Retrieval-Augmented Generation ensures responses are factual, not hallucinated.',
  },
  {
    icon: Clock,
    title: 'Instant Results',
    description: 'Get answers in seconds, not minutes. Optimized for speed and accuracy.',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

const Features = () => {
  return (
    <section id="features" className="py-24 relative">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      
      <div className="relative z-10 container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Everything you need to
            <span className="gradient-text"> understand your documents</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Powered by advanced AI, our platform turns your documents into a conversational knowledge base.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              className="group p-6 rounded-2xl glass-card hover:border-primary/30 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default Features;
