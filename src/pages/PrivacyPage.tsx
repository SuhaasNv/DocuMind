import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { Shield } from 'lucide-react';

const PrivacyPage = () => {
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
        <div className="container mx-auto px-6 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-2 flex items-center justify-center gap-3">
              <Shield className="w-10 h-10 text-primary" />
              Privacy Policy
            </h1>
            <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString('en-SG')}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground"
          >
            <section className="p-6 rounded-2xl glass-card">
              <h2 className="text-xl font-semibold text-foreground mb-3">Information we collect</h2>
              <p>
                DocuMind collects information you provide when you register (e.g. email, name), upload documents, and use the chat feature. Document content is processed to answer your questions and is not used for training third-party models.
              </p>
            </section>

            <section className="p-6 rounded-2xl glass-card">
              <h2 className="text-xl font-semibold text-foreground mb-3">How we use it</h2>
              <p>
                We use your information to provide the service (document processing, RAG-based answers), authenticate you, and improve the product. We do not sell your data.
              </p>
            </section>

            <section className="p-6 rounded-2xl glass-card">
              <h2 className="text-xl font-semibold text-foreground mb-3">Data retention & security</h2>
              <p>
                Documents and chat history are stored securely. You can delete your account and associated data from the app. We use industry-standard practices to protect your data.
              </p>
            </section>

            <section className="p-6 rounded-2xl glass-card">
              <h2 className="text-xl font-semibold text-foreground mb-3">Contact</h2>
              <p>
                For privacy-related questions, contact us at the details on our{' '}
                <Link to="/contact" className="text-primary hover:underline">Contact</Link> page.
              </p>
            </section>
          </motion.div>
        </div>
      </motion.main>

      <Footer />
    </div>
  );
};

export default PrivacyPage;
