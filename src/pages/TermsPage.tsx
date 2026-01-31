import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { FileText } from 'lucide-react';

const TermsPage = () => {
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
              <FileText className="w-10 h-10 text-primary" />
              Terms of Service
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
              <h2 className="text-xl font-semibold text-foreground mb-3">Acceptance</h2>
              <p>
                By using DocuMind, you agree to these terms. If you do not agree, please do not use the service.
              </p>
            </section>

            <section className="p-6 rounded-2xl glass-card">
              <h2 className="text-xl font-semibold text-foreground mb-3">Use of the service</h2>
              <p>
                You may use DocuMind to upload documents and ask questions based on their content. You are responsible for ensuring you have the right to use and process the documents you upload. Do not use the service for illegal or harmful purposes.
              </p>
            </section>

            <section className="p-6 rounded-2xl glass-card">
              <h2 className="text-xl font-semibold text-foreground mb-3">Intellectual property</h2>
              <p>
                DocuMind and its branding remain the property of the service provider. Your documents remain yours; we do not claim ownership of your content.
              </p>
            </section>

            <section className="p-6 rounded-2xl glass-card">
              <h2 className="text-xl font-semibold text-foreground mb-3">Limitation of liability</h2>
              <p>
                The service is provided “as is.” We are not liable for any indirect, incidental, or consequential damages arising from your use of DocuMind.
              </p>
            </section>

            <section className="p-6 rounded-2xl glass-card">
              <h2 className="text-xl font-semibold text-foreground mb-3">Contact</h2>
              <p>
                For questions about these terms, see our{' '}
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

export default TermsPage;
