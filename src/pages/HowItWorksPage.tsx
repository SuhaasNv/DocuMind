import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FileText, Upload, Cpu, Search, MessageSquare, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

const STEPS = [
  {
    title: 'Upload',
    description: 'Upload a PDF from your device. DocuMind accepts files up to 50MB. Your document is stored securely and queued for processing.',
    icon: Upload,
  },
  {
    title: 'Process',
    description: 'In the background, we extract text from your PDF, split it into chunks, and generate vector embeddings. These are stored in a vector database (pgvector) so we can find relevant sections quickly.',
    icon: Cpu,
  },
  {
    title: 'Retrieve',
    description: 'When you ask a question, we embed your query and run a similarity search over your document\'s chunks. The most relevant passages are selected as context for the answer.',
    icon: Search,
  },
  {
    title: 'Chat',
    description: 'A language model (Ollama or OpenAI) receives your question plus the retrieved context and generates an answer grounded in your document. You get streaming responses and optional source citations.',
    icon: MessageSquare,
  },
];

const HowItWorksPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="noise-overlay" />
      <Navbar />
      <div className="pt-28 pb-20 px-6">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
              <FileText className="w-5 h-5 text-primary" />
              <span className="font-semibold">DocuMind</span>
            </Link>
            <h1 className="text-3xl md:text-4xl font-bold mb-4">How DocuMind works</h1>
            <p className="text-muted-foreground text-lg">
              From upload to answer: a simple pipeline for document RAG.
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              Your documents are private to your account and never shared.
            </p>
          </motion.div>

          <div className="space-y-12">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.section
                  key={step.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="flex gap-6 items-start"
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Step {i + 1}
                      </span>
                      {i < STEPS.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-muted-foreground hidden sm:block" />
                      )}
                    </div>
                    <h2 className="text-xl font-semibold mb-2">{step.title}</h2>
                    <p className="text-muted-foreground">{step.description}</p>
                  </div>
                </motion.section>
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-16 text-center"
          >
            <p className="text-muted-foreground mb-4">Ready to try it?</p>
            <Link to="/register">
              <Button size="lg" className="gap-2">
                Get started
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default HowItWorksPage;
