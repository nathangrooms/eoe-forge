import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Star, Zap } from 'lucide-react';
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
      'AI Deck Builder',
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
    <section className="py-24 px-4 bg-gradient-to-b from-background to-spacecraft/5">
      <div className="container mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Choose Your Power Level
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start free and upgrade as your collection grows. All plans include 14-day free trial for Pro features.
          </p>
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={index}
              className={`relative ${
                plan.highlight 
                  ? 'ring-2 ring-spacecraft shadow-xl shadow-spacecraft/20 scale-105' 
                  : 'hover:shadow-lg'
              } transition-all duration-300 bg-card/50 backdrop-blur-sm`}
            >
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-spacecraft text-spacecraft-foreground px-3 py-1">
                    {plan.badge}
                  </Badge>
                </div>
              )}
              
              <CardHeader className="text-center pb-8">
                <div className={`mx-auto mb-4 p-3 rounded-full ${
                  plan.highlight ? 'bg-spacecraft/20' : 'bg-muted/50'
                }`}>
                  <plan.icon className={`h-6 w-6 ${
                    plan.highlight ? 'text-spacecraft' : 'text-foreground'
                  }`} />
                </div>
                
                <CardTitle className="text-2xl font-bold mb-2">{plan.name}</CardTitle>
                <div className="mb-2">
                  <span className={`text-4xl font-bold ${
                    plan.highlight ? 'text-spacecraft' : 'text-foreground'
                  }`}>
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <CardDescription className="text-base">{plan.description}</CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center gap-3">
                      <Check className={`h-4 w-4 ${
                        plan.highlight ? 'text-spacecraft' : 'text-muted-foreground'
                      }`} />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Link to="/register" className="block">
                  <Button 
                    variant={plan.variant}
                    className={`w-full ${
                      plan.highlight 
                        ? 'bg-spacecraft hover:bg-spacecraft/90 text-spacecraft-foreground' 
                        : ''
                    }`}
                    size="lg"
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <p className="text-muted-foreground mb-4">
            All plans include access to our comprehensive card database and community features.
          </p>
          <p className="text-sm text-muted-foreground">
            No credit card required for free trial • Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
}