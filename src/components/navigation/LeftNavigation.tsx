import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  Plus,
  Camera,
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
    title: 'Deck Builder',
    href: '/smart-builder',
    icon: Sparkles,
    badge: 'New',
    section: 'tools'
  },
  {
    title: 'MTG Brain',
    href: '/brain',
    icon: Brain,
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
    badge: 'Alpha',
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

export function LeftNavigation() {
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
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:bg-accent',
          isActive 
            ? 'bg-accent text-accent-foreground font-medium' 
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <item.icon className="h-4 w-4" />
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
    // Hide admin section for non-admin users
    if (sectionKey === 'admin' && !isAdmin) return null;
    
    const sectionItems = NAV_ITEMS.filter(item => item.section === sectionKey);
    if (sectionItems.length === 0) return null;

    return (
      <div key={sectionKey} className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3">
          {SECTIONS[sectionKey as keyof typeof SECTIONS]}
        </h4>
        <nav className="space-y-1">
          {sectionItems.map(renderNavItem)}
        </nav>
      </div>
    );
  };

  const handleQuickBuild = () => {
    // Create a new empty deck and navigate to deck builder
    const newDeck = {
      id: crypto.randomUUID(),
      name: 'New Deck',
      format: 'commander',
      cards: [],
      commander: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Store in localStorage for the deck builder to pick up
    localStorage.setItem('pendingDeck', JSON.stringify(newDeck));
    navigate('/deck-builder');
  };

  return (
    <div className="flex h-full w-64 flex-col border-r bg-background pt-4">
      <div className="flex-1 overflow-auto py-4 px-3 space-y-6">
        {Object.keys(SECTIONS).map(renderSection)}
      </div>
      
      <div className="border-t p-3">
        <div className="text-xs text-muted-foreground">
          <p>DeckMatrix v1.0</p>
          <p>Currently in early development</p>
        </div>
      </div>
    </div>
  );
}