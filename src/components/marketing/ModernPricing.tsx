import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/forever',
    description: 'Perfect for casual players',
    features: [
      'Up to 3 decks',
      'Basic collection tracking',
      'Wishlist management',
      'Community features',
      'Card search & browse'
    ],
    cta: 'Get Started',
    popular: false
  },
  {
    name: 'Pro',
    price: '$9',
    period: '/month',
    description: 'For serious deck builders',
    features: [
      'Unlimited decks',
      'Smart Deck Builder',
      'Power level analysis',
      'Storage management',
      'Advanced analytics',
      'Priority support',
      'Export to all formats'
    ],
    cta: 'Start 14-Day Trial',
    popular: true
  },
  {
    name: 'Premium',
    price: '$19',
    period: '/month',
    description: 'For competitive players',
    features: [
      'Everything in Pro',
      'Tournament tracking',
      'Team collaboration',
      'API access',
      'Custom formats',
      'Early feature access',
      'Dedicated support'
    ],
    cta: 'Start 14-Day Trial',
    popular: false
  }
];

export function ModernPricing() {
  return (
    <section className="py-16 sm:py-24 relative overflow-hidden" id="pricing">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-muted/20 via-background to-muted/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-500/5 via-transparent to-transparent" />
      
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        {/* Header */}
        <motion.div 
          className="text-center max-w-3xl mx-auto mb-12 sm:mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="outline" className="mb-4 border-purple-500/30 bg-purple-500/10 text-foreground">
            <Sparkles className="h-3 w-3 mr-2" />
            Simple Pricing
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 text-foreground">
            Choose Your Plan
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            Start free and upgrade anytime. All plans include 14-day free trial.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={plan.popular ? 'md:-mt-4' : ''}
            >
              <Card className={`
                relative h-full p-6 sm:p-8 bg-card/60 backdrop-blur-sm border-2 transition-all duration-300
                ${plan.popular 
                  ? 'border-purple-500/50 shadow-xl shadow-purple-500/10 scale-105' 
                  : 'border-border/50 hover:border-purple-500/30 hover:shadow-lg'
                }
              `}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-1">
                      Most Popular
                    </Badge>
                  </div>
                )}

                <div className="space-y-6">
                  {/* Header */}
                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-bold text-foreground">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground">{plan.description}</p>
                  </div>

                  {/* Price */}
                  <div className="text-center py-4">
                    <div className="flex items-baseline justify-center">
                      <span className={`text-5xl font-bold ${
                        plan.popular 
                          ? 'bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent' 
                          : 'text-foreground'
                      }`}>
                        {plan.price}
                      </span>
                      <span className="text-muted-foreground ml-2">{plan.period}</span>
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                          plan.popular ? 'bg-purple-500/20' : 'bg-muted'
                        }`}>
                          <Check className={`h-3 w-3 ${
                            plan.popular ? 'text-purple-400' : 'text-muted-foreground'
                          }`} />
                        </div>
                        <span className="text-sm text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Link to="/register" className="block">
                    <Button 
                      className={`w-full group ${
                        plan.popular 
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600' 
                          : 'variant-outline border-2'
                      }`}
                      size="lg"
                    >
                      {plan.cta}
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Bottom Info */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mt-12 space-y-4"
        >
          <p className="text-sm text-muted-foreground">
            All plans include access to our comprehensive card database
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              No credit card required
            </span>
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Cancel anytime
            </span>
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
              14-day money-back guarantee
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
