import { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import logo from '@/assets/deckmatrix-logo.png';

interface AuthLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  showBackToHome?: boolean;
}

export function AuthLayout({ title, description, children, showBackToHome = true }: AuthLayoutProps) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-background via-primary/5 to-purple-900/10">
      {/* Animated Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--primary)/0.1)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--primary)/0.1)_1px,transparent_1px)] bg-[size:40px_40px] animate-pulse" />
      
      {/* Floating Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl animate-float" />
        <div className="absolute top-40 right-20 w-24 h-24 bg-purple-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-40 left-20 w-20 h-20 bg-violet-500/15 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-20 right-10 w-28 h-28 bg-primary/15 rounded-full blur-3xl animate-float" style={{ animationDelay: '3s' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Back to Home */}
          {showBackToHome && (
            <div className="text-center">
              <Link 
                to="/" 
                className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors text-sm"
              >
                ← Back to Home
              </Link>
            </div>
          )}

          {/* Logo */}
          <div className="text-center">
            <Link to="/" className="inline-flex items-center justify-center">
              <img 
                src={logo} 
                alt="DeckMatrix Logo" 
                className="h-16 md:h-20 w-auto"
              />
            </Link>
          </div>

          {/* Auth Card */}
          <Card className="relative bg-card/80 backdrop-blur-md border-primary/20 shadow-xl">
            {/* Card Glow Effect */}
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/10 to-purple-600/10 opacity-50" />
            
            <CardHeader className="relative z-10 text-center space-y-2">
              <CardTitle className="text-2xl font-bold">{title}</CardTitle>
              <CardDescription className="text-base">{description}</CardDescription>
            </CardHeader>
            
            <CardContent className="relative z-10">
              {children}
            </CardContent>
          </Card>

          {/* Social Proof */}
          <div className="text-center text-sm text-muted-foreground">
            <p>Trusted by thousands of Magic players worldwide</p>
          </div>
        </div>
      </div>
    </div>
  );
}