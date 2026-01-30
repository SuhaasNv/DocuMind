import { Link } from 'react-router-dom';
import { FileText, Github, Twitter, Linkedin } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="border-t border-border/50 py-12 bg-card/30">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <span className="text-lg font-semibold">DocuMind</span>
          </div>

          {/* Links */}
          <nav className="flex items-center gap-8 text-sm text-muted-foreground">
            <Link to="#" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link to="#" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link to="#" className="hover:text-foreground transition-colors">
              Documentation
            </Link>
            <Link to="#" className="hover:text-foreground transition-colors">
              Contact
            </Link>
          </nav>

          {/* Socials */}
          <div className="flex items-center gap-4">
            <a
              href="#"
              className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
              aria-label="GitHub"
            >
              <Github className="w-4 h-4" />
            </a>
            <a
              href="#"
              className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
              aria-label="Twitter"
            >
              <Twitter className="w-4 h-4" />
            </a>
            <a
              href="#"
              className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
              aria-label="LinkedIn"
            >
              <Linkedin className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border/30 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} DocuMind. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
