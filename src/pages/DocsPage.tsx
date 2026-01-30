import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { Button } from '@/components/ui/button';
import { BookOpen, Upload, MessageSquare, Key, ArrowRight } from 'lucide-react';

const sections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: BookOpen,
    items: [
      {
        title: 'Create an account',
        body: 'Sign up at /register to get your API token and access the dashboard.',
      },
      {
        title: 'Upload a document',
        body: 'From the dashboard, drag and drop a PDF or use the upload button. Processing usually finishes within a minute.',
      },
      {
        title: 'Chat with your document',
        body: 'Open a document to start a chat. Ask questions in plain language; answers are grounded in the document content.',
      },
    ],
  },
  {
    id: 'api',
    title: 'API Overview',
    icon: Key,
    items: [
      {
        title: 'Authentication',
        body: 'Use a Bearer token in the Authorization header: Authorization: Bearer <your_jwt>. Obtain the token via POST /auth/login.',
      },
      {
        title: 'Upload documents',
        body: 'POST /documents/upload with multipart/form-data (file). Returns document id and status. Poll GET /documents/:id for processing status.',
      },
      {
        title: 'Chat (SSE)',
        body: 'POST /documents/:id/chat with JSON body { query: "your question" }. Response is Server-Sent Events: chunk events with text, then a done event.',
      },
    ],
  },
];

const quickLinks = [
  { label: 'Dashboard', href: '/app', icon: Upload },
  { label: 'Register', href: '/register', icon: Key },
];

const DocsPage = () => {
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
        <div className="container mx-auto px-6 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              DocuMind <span className="gradient-text">documentation</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Everything you need to upload documents and chat with AI.
            </p>
          </motion.div>

          <div className="flex flex-wrap gap-4 justify-center mb-16">
            {quickLinks.map((link) => (
              <Link key={link.href} to={link.href}>
                <Button variant="outline" className="gap-2">
                  <link.icon className="w-4 h-4" />
                  {link.label}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            ))}
          </div>

          <div className="space-y-16">
            {sections.map((section, sectionIndex) => (
              <motion.section
                key={section.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: sectionIndex * 0.1 }}
                id={section.id}
              >
                <h2 className="flex items-center gap-2 text-2xl font-semibold mb-6">
                  <section.icon className="w-6 h-6 text-primary" />
                  {section.title}
                </h2>
                <div className="space-y-6">
                  {section.items.map((item, i) => (
                    <div
                      key={item.title}
                      className="p-6 rounded-2xl glass-card hover:border-primary/30 transition-colors"
                    >
                      <h3 className="text-lg font-medium mb-2">{item.title}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {item.body}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.section>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-16 p-6 rounded-2xl glass-card border-primary/20 text-center"
          >
            <MessageSquare className="w-10 h-10 text-primary mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-2">Need more help?</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Check the dashboard for live document status, or sign up to start chatting.
            </p>
            <Link to="/register">
              <Button>Get Started</Button>
            </Link>
          </motion.div>
        </div>
      </motion.main>

      <Footer />
    </div>
  );
};

export default DocsPage;
