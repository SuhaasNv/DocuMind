import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FileText, Upload, Cpu, Search, MessageSquare, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

const STEPS = [
  {
    step: 1,
    title: 'Upload your PDF',
    description: 'Upload a PDF from your device. DocuMind accepts files up to 50MB. Your document is stored securely and queued for processing.',
    icon: Upload,
  },
  {
    step: 2,
    title: 'We process it',
    description: 'We extract text from your PDF, split it into chunks, and generate vector embeddings. These are stored in a vector database so we can find relevant sections quickly.',
    icon: Cpu,
  },
  {
    step: 3,
    title: 'You ask a question',
    description: 'When you ask something, we embed your query and run a similarity search over your document. The most relevant passages are selected as context for the answer.',
    icon: Search,
  },
  {
    step: 4,
    title: 'Get grounded answers',
    description: 'A language model receives your question plus the retrieved context and generates an answer grounded in your document. You get streaming responses and optional source citations.',
    icon: MessageSquare,
  },
];

const HowItWorksPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="noise-overlay" />
      <Navbar />

      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="pt-28 pb-20"
      >
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="container mx-auto px-6 text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            Simple pipeline
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4">
            How it <span className="gradient-text">works</span>
          </h1>
          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-2">
            From upload to answer in four steps. Your documents stay private and are never shared.
          </p>
          <p className="text-muted-foreground text-sm">
            Powered by RAG — retrieval-augmented generation for accurate, document-grounded answers.
          </p>
        </motion.section>

        {/* Steps */}
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="space-y-6">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.article
                  key={step.title}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="p-6 md:p-8 rounded-2xl glass-card hover:border-primary/30 transition-colors flex flex-col sm:flex-row gap-6 items-start"
                >
                  <div className="flex-shrink-0 flex items-center gap-4 sm:flex-col sm:gap-2">
                    <span className="w-12 h-12 rounded-xl bg-primary/20 text-primary font-bold flex items-center justify-center text-lg">
                      {step.step}
                    </span>
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 sm:w-14 sm:h-14">
                      <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl md:text-2xl font-semibold mb-2">{step.title}</h2>
                    <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="hidden sm:flex flex-shrink-0 self-center text-muted-foreground/50">
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  )}
                </motion.article>
              );
            })}
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-16 text-center"
          >
            <p className="text-muted-foreground mb-6">Ready to chat with your documents?</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link to="/register">
                <Button size="lg" className="gap-2 w-full sm:w-auto">
                  Get started
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/docs">
                <Button variant="outline" size="lg" className="gap-2 w-full sm:w-auto border-primary/40 text-primary hover:bg-primary/10">
                  <FileText className="w-4 h-4" />
                  View docs
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </motion.main>

      <Footer />
    </div>
  );
};

export default HowItWorksPage;
