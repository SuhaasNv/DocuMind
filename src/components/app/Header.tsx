import { Menu, Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/stores/useAppStore';

interface HeaderProps {
  title?: string;
}

const Header = ({ title = 'Documents' }: HeaderProps) => {
  const { toggleSidebar, user } = useAppStore();

  return (
    <header className="h-16 border-b border-border bg-background/80 backdrop-blur-lg flex items-center justify-between px-6 sticky top-0 z-40">
      {/* Left section */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="lg:hidden text-muted-foreground"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="hidden md:flex relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search documents..."
            className="w-64 pl-10 bg-secondary/50 border-border/50 focus:border-primary/50"
          />
        </div>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="w-5 h-5" />
        </Button>

        {/* User avatar */}
        <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary">
          {user?.name?.charAt(0).toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  );
};

export default Header;
