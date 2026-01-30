import { motion } from 'framer-motion';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { Upload, Zap, MessageSquare, Shield, Brain, Clock } from 'lucide-react';

const features = [
  {
    icon: Upload,
    title: 'Upload PDFs',
    description: 'Simply drag and drop your documents. We support PDF files of any size.',
    detail: 'No conversion needed — upload PDFs directly and our pipeline extracts text, chunks, and embeddings automatically.',
  },
  {
    icon: Zap,
    title: 'Real-time Processing',
    description: 'Watch as your documents are processed in real-time with live progress updates.',
    detail: 'Processing status is streamed to the UI so you know exactly when your document is ready for chat.',
  },
  {
    icon: MessageSquare,
    title: 'AI Chat',
    description: 'Ask questions naturally and get accurate answers grounded in your documents.',
    detail: 'Streaming responses keep the conversation fluid. Answers cite your document content, not generic knowledge.',
  },
  {
    icon: Shield,
    title: 'Secure & Private',
    description: 'Your documents are encrypted and never shared. Enterprise-grade security.',
    detail: 'Data stays in your environment. We use JWT auth, secure storage, and do not train on your content.',
  },
  {
    icon: Brain,
    title: 'RAG Technology',
    description: 'Retrieval-Augmented Generation ensures responses are factual, not hallucinated.',
    detail: 'Vector search finds relevant chunks; the LLM answers only from retrieved context for reliable results.',
  },
  {
    icon: Clock,
    title: 'Instant Results',
    description: 'Get answers in seconds, not minutes. Optimized for speed and accuracy.',
    detail: 'Embeddings and vector search are tuned for low latency so chat feels instant.',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const FeaturesPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="noise-overlay" />
      <Navbar />

      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="pt-28 pb-16"
      >
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Everything you need to
              <span className="gradient-text"> understand your documents</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Powered by advanced AI, DocuMind turns your PDFs into a conversational knowledge base.
            </p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
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
                <h2 className="text-xl font-semibold mb-2">{feature.title}</h2>
                <p className="text-muted-foreground mb-3">{feature.description}</p>
                <p className="text-sm text-muted-foreground/80">{feature.detail}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.main>

      <Footer />
    </div>
  );
};

export default FeaturesPage;
