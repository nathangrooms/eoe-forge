import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { 
  Home,
  Package,
  Crown,
  Hammer,
  Search,
  Sparkles,
  Heart,
  Shield,
  Settings,
  Camera,
  Menu,
  X
} from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    title: 'Home',
    href: '/',
    icon: Home,
    section: 'main'
  },
  {
    title: 'Collection',
    href: '/collection',
    icon: Package,
    section: 'main'
  },
  {
    title: 'Decks',
    href: '/decks',
    icon: Crown,
    section: 'main'
  },
  {
    title: 'Deck Builder',
    href: '/deck-builder',
    icon: Hammer,
    section: 'main'
  },
  {
    title: 'Card Search',
    href: '/cards',
    icon: Search,
    section: 'main'
  },
  {
    title: 'Fast Scan',
    href: '/scan',
    icon: Camera,
    section: 'tools'
  },
  {
    title: 'AI Builder',
    href: '/ai-builder',
    icon: Sparkles,
    badge: 'New',
    section: 'tools'
  },
  {
    title: 'Wishlist',
    href: '/wishlist',
    icon: Heart,
    section: 'tools'
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    section: 'user'
  }
];

const SECTIONS = {
  main: 'Main',
  tools: 'Tools',
  user: 'User'
};

export function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const renderNavItem = (item: NavItem) => {
    const isActive = location.pathname === item.href || 
                    (item.href !== '/' && location.pathname.startsWith(item.href));

    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={() => setIsOpen(false)}
        className={cn(
          'flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-all',
          isActive 
            ? 'bg-primary text-primary-foreground font-medium' 
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        )}
      >
        <item.icon className="h-5 w-5" />
        <span className="flex-1">{item.title}</span>
        {item.badge && (
          <Badge variant="secondary" className="text-xs">
            {item.badge}
          </Badge>
        )}
      </Link>
    );
  };

  const renderSection = (sectionKey: string) => {
    const sectionItems = NAV_ITEMS.filter(item => item.section === sectionKey);
    if (sectionItems.length === 0) return null;

    return (
      <div key={sectionKey} className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4">
          {SECTIONS[sectionKey as keyof typeof SECTIONS]}
        </h4>
        <nav className="space-y-1">
          {sectionItems.map(renderNavItem)}
        </nav>
      </div>
    );
  };

  return (
    <div className="md:hidden">
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className="fixed top-4 left-4 z-50 md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <div className="flex h-full flex-col">
            <div className="flex h-14 items-center border-b px-4">
              <h2 className="font-semibold">Navigation</h2>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex-1 overflow-auto py-4 space-y-6">
              {Object.keys(SECTIONS).map(renderSection)}
            </div>
            
            <div className="border-t p-4">
              <div className="text-xs text-muted-foreground">
                <p>MTG Builder v1.0</p>
                <p>Enhanced with AI</p>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}