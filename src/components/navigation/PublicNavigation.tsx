import { Button } from '@/components/ui/button';
import { Sparkles, Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';

const navigation = [
  { name: 'Features', href: '#features' },
  { name: 'Pricing', href: '#pricing' },
  { name: 'Docs', href: '#docs' },
];

export function PublicNavigation() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 text-xl font-bold hover:text-spacecraft transition-colors">
            <Sparkles className="h-6 w-6 text-spacecraft" />
            DeckMatrix
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navigation.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className="text-muted-foreground hover:text-spacecraft transition-colors font-medium"
              >
                {item.name}
              </a>
            ))}
          </nav>

          {/* Desktop Auth Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" className="hover:text-spacecraft">
                Login
              </Button>
            </Link>
            <Link to="/register">
              <Button className="bg-spacecraft hover:bg-station transition-colors">
                Register
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-muted-foreground hover:text-spacecraft transition-colors"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden py-4 border-t border-border/50">
            <nav className="space-y-4">
              {navigation.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="block text-muted-foreground hover:text-spacecraft transition-colors font-medium"
                  onClick={() => setIsOpen(false)}
                >
                  {item.name}
                </a>
              ))}
              <div className="pt-4 space-y-2">
                <Link to="/login" onClick={() => setIsOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start hover:text-spacecraft">
                    Login
                  </Button>
                </Link>
                <Link to="/register" onClick={() => setIsOpen(false)}>
                  <Button className="w-full bg-spacecraft hover:bg-station">
                    Register
                  </Button>
                </Link>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}