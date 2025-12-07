import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/components/AuthProvider';
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
  Plus,
  ShoppingCart,
  Brain,
  Swords,
  Trophy,
  Layers
} from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  section?: string;
}

// Match LeftNavigation exactly
const NAV_ITEMS: NavItem[] = [
  {
    title: 'Home',
    href: '/',
    icon: Home,
    section: 'main'
  },
  {
    title: 'Collection Manager',
    href: '/collection',
    icon: Package,
    section: 'main'
  },
  {
    title: 'Marketplace',
    href: '/marketplace',
    icon: ShoppingCart,
    section: 'main'
  },
  {
    title: 'Decks',
    href: '/decks',
    icon: Crown,
    section: 'main'
  },
  {
    title: 'Precons',
    href: '/precons',
    icon: Layers,
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
    title: 'MTG Brain',
    href: '/brain',
    icon: Brain,
    badge: 'AI',
    section: 'tools'
  },
  {
    title: 'Wishlist',
    href: '/wishlist',
    icon: Heart,
    section: 'tools'
  },
  {
    title: 'Deck Simulation',
    href: '/simulate',
    icon: Swords,
    badge: 'Beta',
    section: 'tools'
  },
  {
    title: 'Tournaments',
    href: '/tournament',
    icon: Trophy,
    section: 'tools'
  },
  {
    title: 'Admin Panel',
    href: '/admin',
    icon: Shield,
    section: 'admin'
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
  admin: 'Admin',
  user: 'User'
};

export function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

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
        <item.icon className="h-5 w-5 flex-shrink-0" />
        <span className="flex-1 truncate">{item.title}</span>
        {item.badge && (
          <Badge variant="secondary" className="text-xs flex-shrink-0">
            {item.badge}
          </Badge>
        )}
      </Link>
    );
  };

  const renderSection = (sectionKey: string) => {
    // Hide admin section for non-admin users
    if (sectionKey === 'admin' && !isAdmin) return null;
    
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

  const handleQuickBuild = () => {
    const newDeck = {
      id: crypto.randomUUID(),
      name: 'New Deck',
      format: 'commander',
      cards: [],
      commander: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    localStorage.setItem('pendingDeck', JSON.stringify(newDeck));
    setIsOpen(false);
    navigate('/deck-builder');
  };

  return (
    <div className="md:hidden">
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-auto py-4 space-y-6">
              {Object.keys(SECTIONS).map(renderSection)}
            </div>
            
            <div className="border-t p-4">
              <div className="text-xs text-muted-foreground">
                <p>DeckMatrix v1.0</p>
                <p>Currently in early development</p>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}