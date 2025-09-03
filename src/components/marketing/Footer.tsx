import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="bg-gradient-to-b from-background to-spacecraft/10 border-t border-border/50">
      {/* CTA Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Level Up Your Game?
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join thousands of players building better decks with AI-powered insights.
          </p>
          <Link to="/register">
            <Button 
              size="lg" 
              className="px-8 py-4 text-lg bg-gradient-to-r from-spacecraft to-station hover:from-station hover:to-warp transition-all duration-300 shadow-lg hover:shadow-spacecraft/25 cosmic-glow"
            >
              <Sparkles className="h-5 w-5 mr-2" />
              Sign Up Free
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer Links */}
      <div className="border-t border-border/50 py-12 px-4">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-spacecraft" />
                <span className="text-xl font-bold">DeckMatrix</span>
              </div>
              <p className="text-muted-foreground">
                The ultimate Magic: The Gathering deck building companion.
              </p>
            </div>

            {/* Product */}
            <div className="space-y-4">
              <h3 className="font-semibold">Product</h3>
              <ul className="space-y-2 text-sm">
                <li><Link to="/features" className="text-muted-foreground hover:text-spacecraft transition-colors">Features</Link></li>
                <li><Link to="/pricing" className="text-muted-foreground hover:text-spacecraft transition-colors">Pricing</Link></li>
                <li><Link to="/demo" className="text-muted-foreground hover:text-spacecraft transition-colors">Demo</Link></li>
                <li><Link to="/changelog" className="text-muted-foreground hover:text-spacecraft transition-colors">Changelog</Link></li>
              </ul>
            </div>

            {/* Support */}
            <div className="space-y-4">
              <h3 className="font-semibold">Support</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-muted-foreground hover:text-spacecraft transition-colors">Documentation</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-spacecraft transition-colors">Help Center</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-spacecraft transition-colors">Contact</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-spacecraft transition-colors">Discord</a></li>
              </ul>
            </div>

            {/* Auth */}
            <div className="space-y-4">
              <h3 className="font-semibold">Get Started</h3>
              <ul className="space-y-2 text-sm">
                <li><Link to="/register" className="text-muted-foreground hover:text-spacecraft transition-colors">Register</Link></li>
                <li><Link to="/login" className="text-muted-foreground hover:text-spacecraft transition-colors">Login</Link></li>
                <li><a href="#" className="text-muted-foreground hover:text-spacecraft transition-colors">API</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-spacecraft transition-colors">Status</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom */}
          <div className="border-t border-border/50 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © 2024 DeckMatrix. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm">
              <a href="#" className="text-muted-foreground hover:text-spacecraft transition-colors">Privacy</a>
              <a href="#" className="text-muted-foreground hover:text-spacecraft transition-colors">Terms</a>
              <a href="#" className="text-muted-foreground hover:text-spacecraft transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}