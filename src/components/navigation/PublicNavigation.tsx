import { Button } from '@/components/ui/button';
import { Crown, Menu, X, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';

export function PublicNavigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-primary/20 bg-background/90 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Enhanced Logo */}
          <Link to="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity group">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-primary/20 flex items-center justify-center border border-primary/30 shadow-glow-subtle group-hover:shadow-glow-elegant transition-all duration-300">
                <Crown className="h-6 w-6 text-primary group-hover:scale-110 transition-transform duration-300" />
              </div>
              <div className="absolute -inset-1 bg-gradient-primary opacity-0 group-hover:opacity-20 blur-lg transition-opacity duration-300 rounded-xl" />
            </div>
            <div>
              <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                DeckMatrix
              </span>
              <div className="text-[10px] text-muted-foreground/80 -mt-1">
                MTG MASTERY PLATFORM
              </div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <a 
              href="#features" 
              className="text-muted-foreground hover:text-primary transition-colors duration-200 font-medium"
            >
              Features
            </a>
            <a 
              href="#pricing" 
              className="text-muted-foreground hover:text-primary transition-colors duration-200 font-medium"
            >
              Pricing
            </a>
            <Link 
              to="/docs" 
              className="text-muted-foreground hover:text-primary transition-colors duration-200 font-medium"
            >
              Docs
            </Link>
            <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
              <Star className="h-3 w-3 text-primary" />
              <span className="text-xs font-medium text-primary">Free Trial</span>
            </div>
          </div>

          {/* Enhanced Desktop Auth Buttons */}
          <div className="hidden md:flex items-center space-x-3">
            <Link to="/login">
              <Button 
                variant="ghost" 
                className="hover:bg-primary/10 hover:text-primary transition-all duration-200"
              >
                Login
              </Button>
            </Link>
            <Link to="/register">
              <Button 
                className="bg-gradient-primary hover:shadow-glow-elegant hover:scale-105 transition-all duration-300 font-semibold"
              >
                Start Free Trial
              </Button>
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 hover:bg-primary/10 rounded-lg transition-colors duration-200"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? (
              <X className="h-6 w-6 text-primary" />
            ) : (
              <Menu className="h-6 w-6 text-primary" />
            )}
          </button>
        </div>

        {/* Enhanced Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-primary/20 py-4 bg-background/95 backdrop-blur-xl">
            <div className="flex flex-col space-y-4">
              <a 
                href="#features" 
                className="text-muted-foreground hover:text-primary transition-colors duration-200 font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Features
              </a>
              <a 
                href="#pricing" 
                className="text-muted-foreground hover:text-primary transition-colors duration-200 font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Pricing
              </a>
              <Link 
                to="/docs" 
                className="text-muted-foreground hover:text-primary transition-colors duration-200 font-medium py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Docs
              </Link>
              <div className="pt-4 border-t border-primary/20 space-y-3">
                <Link to="/login" className="block" onClick={() => setIsMenuOpen(false)}>
                  <Button 
                    variant="ghost" 
                    className="w-full hover:bg-primary/10 hover:text-primary"
                  >
                    Login
                  </Button>
                </Link>
                <Link to="/register" className="block" onClick={() => setIsMenuOpen(false)}>
                  <Button 
                    className="w-full bg-gradient-primary hover:shadow-glow-elegant font-semibold"
                  >
                    Start Free Trial
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}