import { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AuthLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  showBackToHome?: boolean;
}

export function AuthLayout({ title, description, children, showBackToHome = true }: AuthLayoutProps) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-background via-spacecraft/5 to-station/5">
      {/* Animated Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--spacecraft)/0.1)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--spacecraft)/0.1)_1px,transparent_1px)] bg-[size:40px_40px] animate-pulse" />
      
      {/* Floating Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-6 h-6 text-spacecraft/20 animate-float">⚪</div>
        <div className="absolute top-40 right-20 w-4 h-4 text-station/20 animate-float" style={{ animationDelay: '1s' }}>🔵</div>
        <div className="absolute bottom-40 left-20 w-4 h-4 text-void/20 animate-float" style={{ animationDelay: '2s' }}>⚫</div>
        <div className="absolute bottom-20 right-10 w-6 h-6 text-planet/20 animate-float" style={{ animationDelay: '3s' }}>🔴</div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Back to Home */}
          {showBackToHome && (
            <div className="text-center">
              <Link 
                to="/" 
                className="inline-flex items-center gap-2 text-spacecraft hover:text-station transition-colors text-sm"
              >
                ← Back to Home
              </Link>
            </div>
          )}

          {/* Logo */}
          <div className="text-center">
            <Link to="/" className="inline-flex items-center gap-2 text-2xl font-bold">
              <Sparkles className="h-8 w-8 text-spacecraft animate-glow" />
              DeckMatrix
            </Link>
          </div>

          {/* Auth Card */}
          <Card className="relative bg-card/80 backdrop-blur-md border-spacecraft/20 shadow-xl">
            {/* Card Glow Effect */}
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-spacecraft/10 to-station/10 opacity-50" />
            
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