import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Star, Zap, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const plans = [
  {
    name: 'Free Plan',
    price: '$0',
    period: '/forever',
    description: 'Perfect for casual players',
    features: [
      'Basic collection manager',
      'Up to 1 deck',
      'Wishlist tracking',
      'Community support'
    ],
    cta: 'Get Started Free',
    variant: 'outline' as const,
    icon: Check
  },
  {
    name: 'Pro',
    price: '$9',
    period: '/month',
    description: '14-day free trial',
    badge: 'Most Popular',
    features: [
      'Unlimited decks',
      'Smart Deck Builder',
      'Power level analysis',
      'Storage management',
      'Priority support',
      'Advanced analytics'
    ],
    cta: 'Start Free Trial',
    variant: 'default' as const,
    icon: Star,
    highlight: true
  },
  {
    name: 'Premium',
    price: '$19',
    period: '/month',
    description: 'For serious players',
    features: [
      'Everything in Pro',
      'Tournament tracking',
      'Team collaboration',
      'API access',
      'Custom formats',
      'Priority support'
    ],
    cta: 'Start Free Trial',
    variant: 'outline' as const,
    icon: Zap
  }
];

export function Pricing() {
  return (
    <section className="py-32 px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-spacecraft/5 to-background" />
      <div className="absolute inset-0 bg-gradient-nebula opacity-10" />
      
      <div className="container mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-20">
          <Badge variant="outline" className="mb-8 px-6 py-3 text-sm border-primary/30 bg-primary/10">
            <Star className="h-4 w-4 mr-2" />
            Flexible Plans
          </Badge>
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-8">
            <span className="text-foreground">Choose Your</span>
            <br />
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Power Level
            </span>
          </h2>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Start free and upgrade as your collection grows. All Pro plans include 14-day free trial.
          </p>
        </div>

        {/* Pricing Grid - Magic Card Style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={index}
              className={`group relative ${
                plan.highlight 
                  ? 'ring-2 ring-primary shadow-2xl shadow-primary/30 scale-105 hover:scale-110' 
                  : 'hover:shadow-xl hover:scale-105'
              } transition-all duration-500 bg-gradient-to-br from-card via-card/90 to-card/80 backdrop-blur-xl border-2 ${
                plan.highlight ? 'border-primary/50' : 'border-border/50 hover:border-primary/30'
              }`}
              style={{
                transformStyle: 'preserve-3d',
                perspective: '1000px'
              }}
            >
              {/* Glow effect for highlighted plan */}
              {plan.highlight && (
                <div className="absolute -inset-4 bg-gradient-primary blur-2xl opacity-30 group-hover:opacity-50 transition-opacity duration-500 rounded-3xl" />
              )}
              
              {plan.badge && (
                <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 z-20">
                  <Badge className="bg-gradient-primary text-primary-foreground px-5 py-2 text-sm font-bold shadow-glow-elegant animate-pulse">
                    <Star className="h-3 w-3 mr-1" />
                    {plan.badge}
                  </Badge>
                </div>
              )}
              
              <CardHeader className="relative z-10 text-center pb-8 pt-8">
                <div className={`mx-auto mb-6 p-4 rounded-2xl ${
                  plan.highlight ? 'bg-primary/20 border-2 border-primary/40' : 'bg-muted/50'
                } transition-all duration-300 group-hover:scale-110`}>
                  <plan.icon className={`h-8 w-8 ${
                    plan.highlight ? 'text-primary' : 'text-foreground'
                  }`} />
                </div>
                
                <CardTitle className="text-3xl font-bold mb-4 text-foreground">{plan.name}</CardTitle>
                <div className="mb-4">
                  <span className={`text-5xl md:text-6xl font-bold ${
                    plan.highlight ? 'bg-gradient-primary bg-clip-text text-transparent' : 'text-foreground'
                  }`}>
                    {plan.price}
                  </span>
                  <span className="text-lg text-muted-foreground">{plan.period}</span>
                </div>
                <CardDescription className="text-base text-muted-foreground">{plan.description}</CardDescription>
              </CardHeader>
              
              <CardContent className="relative z-10 space-y-8 px-8 pb-8">
                <ul className="space-y-4">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center gap-3 group/item">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        plan.highlight ? 'bg-primary/20' : 'bg-muted/50'
                      }`}>
                        <Check className={`h-4 w-4 ${
                          plan.highlight ? 'text-primary' : 'text-muted-foreground'
                        } group-hover/item:scale-125 transition-transform`} />
                      </div>
                      <span className="text-sm text-foreground/90">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Link to="/register" className="block">
                  <Button 
                    variant={plan.variant}
                    className={`w-full group/btn ${
                      plan.highlight 
                        ? 'bg-gradient-primary hover:shadow-glow-elegant text-primary-foreground font-bold' 
                        : 'border-2 hover:border-primary/50'
                    }`}
                    size="lg"
                  >
                    {plan.cta}
                    <ArrowRight className="h-4 w-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-20 space-y-6">
          <p className="text-lg text-muted-foreground">
            All plans include access to our comprehensive card database and community features.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              No credit card required
            </span>
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              Cancel anytime
            </span>
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-type-commander animate-pulse" />
              14-day free trial
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}