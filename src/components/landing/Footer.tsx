import { Link } from 'react-router-dom';
import { FileText, Github, Linkedin } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="border-t border-border/50 py-10 sm:py-12 bg-card/30">
      <div className="container mx-auto px-4 sm:px-6">

        {/* Top row */}
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between sm:items-start">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <span className="text-lg font-semibold">DocuMind</span>
          </Link>

          {/* Nav links — wrap on narrow screens */}
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
            {[
              { to: '/features',    label: 'Features' },
              { to: '/pricing',     label: 'Pricing' },
              { to: '/docs',        label: 'Docs' },
              { to: '/about',       label: 'About' },
              { to: '/privacy',     label: 'Privacy' },
              { to: '/terms',       label: 'Terms' },
              { to: '/contact',     label: 'Contact' },
            ].map(({ to, label }) => (
              <Link key={to} to={to} className="hover:text-foreground transition-colors active:opacity-70">
                {label}
              </Link>
            ))}
          </nav>

          {/* Socials */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="https://github.com/SuhaasNv"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors active:scale-95"
              aria-label="GitHub"
            >
              <Github className="w-4 h-4" />
            </a>
            <a
              href="https://www.linkedin.com/in/suhaasnv/"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors active:scale-95"
              aria-label="LinkedIn"
            >
              <Linkedin className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="mt-8 pt-6 border-t border-border/30 text-center text-xs sm:text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} DocuMind. All rights reserved.</p>
        </div>

      </div>
    </footer>
  );
};

export default Footer;
