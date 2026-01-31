import { motion } from 'framer-motion';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { Mail, Phone, MapPin, Clock, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const ContactPage = () => {
  const email = 'nvijayasuhaas@gmail.com';
  const phone = '+65 86424324';

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
            <h1 className="text-4xl md:text-5xl font-bold mb-2">
              Get in <span className="gradient-text">Touch</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Have a question, feedback, or want to work together? Reach out using the details below.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="space-y-6"
          >
            <a
              href={`mailto:${email}`}
              className="block p-6 rounded-2xl glass-card hover:border-primary/40 transition-colors group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/30 transition-colors">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground mb-1">Email</h2>
                  <p className="text-muted-foreground text-sm mb-1">Best for general inquiries and support</p>
                  <span className="text-primary font-medium break-all">{email}</span>
                </div>
              </div>
            </a>

            <a
              href={`tel:${phone.replace(/\s/g, '')}`}
              className="block p-6 rounded-2xl glass-card hover:border-primary/40 transition-colors group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/30 transition-colors">
                  <Phone className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground mb-1">Phone</h2>
                  <p className="text-muted-foreground text-sm mb-1">Call or WhatsApp</p>
                  <span className="text-primary font-medium">{phone}</span>
                </div>
              </div>
            </a>

            <div className="p-6 rounded-2xl glass-card">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground mb-1">Location</h2>
                  <p className="text-muted-foreground text-sm mb-1">Based in</p>
                  <span className="text-foreground font-medium">Singapore</span>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl glass-card">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground mb-1">Response time</h2>
                  <p className="text-muted-foreground text-sm">
                    We aim to reply to emails within 1–2 business days.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl glass-card border-primary/20">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground mb-2">Using DocuMind?</h2>
                  <p className="text-muted-foreground text-sm mb-4">
                    For product help, API questions, or document issues, check the Docs first or reach out via email.
                  </p>
                  <Link to="/docs">
                    <Button variant="outline" size="sm" className="border-primary/40 text-primary hover:bg-primary/10">
                      View Documentation
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.main>

      <Footer />
    </div>
  );
};

export default ContactPage;
