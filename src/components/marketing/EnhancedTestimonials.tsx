import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Star, Quote, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

const testimonials = [
  {
    name: 'Alex Rivera',
    role: 'Competitive Commander Player',
    avatar: 'AR',
    rating: 5,
    text: "DeckMatrix's AI builder helped me optimize my cEDH deck to a consistent Turn 3-4 win. The power level analysis is incredibly accurate.",
    highlight: 'cEDH Optimization'
  },
  {
    name: 'Sarah Chen',
    role: 'MTG Content Creator',
    avatar: 'SC',
    rating: 5,
    text: 'The collection tracking is phenomenal. I can finally see my entire $50K+ collection value in real-time and get instant alerts on price spikes.',
    highlight: 'Collection Value: $50K+'
  },
  {
    name: 'Marcus Johnson',
    role: 'LGS Tournament Winner',
    avatar: 'MJ',
    rating: 5,
    text: 'Went from casual player to tournament winner in 3 months using DeckMatrix. The synergy detection found combos I never knew existed.',
    highlight: 'Tournament Winner'
  },
  {
    name: 'Emily Thompson',
    role: 'Budget Builder',
    avatar: 'ET',
    rating: 5,
    text: "Built a powerful $50 deck that competes with $500+ decks. The AI suggestions for budget alternatives are incredible.",
    highlight: '$50 Budget Build'
  },
  {
    name: 'David Park',
    role: 'Deck Brewer',
    avatar: 'DP',
    rating: 5,
    text: 'I brew new decks every week and this platform makes it effortless. The analysis tools save me hours of research.',
    highlight: '200+ Decks Built'
  },
  {
    name: 'Lisa Martinez',
    role: 'Modern Enthusiast',
    avatar: 'LM',
    rating: 5,
    text: 'The marketplace integration is seamless. Sold my entire collection transition from Modern to Pioneer in a week.',
    highlight: '$5K+ Sold'
  }
];

export function EnhancedTestimonials() {
  return (
    <section className="py-24 relative overflow-hidden bg-gradient-to-b from-background to-card/20">
      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <motion.div 
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="outline" className="mb-4">
            <Sparkles className="h-3 w-3 mr-2" />
            Trusted by Thousands
          </Badge>
          <h2 className="text-4xl md:text-6xl font-bold mb-6">
            What Players Are Saying
          </h2>
          <div className="flex items-center justify-center gap-2 text-2xl font-bold">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-8 w-8 fill-primary text-primary" />
            ))}
            <span className="ml-2 text-muted-foreground">4.9/5 from 2,500+ reviews</span>
          </div>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="p-6 h-full hover:shadow-glow-subtle transition-shadow duration-300 bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 relative overflow-hidden group">
                {/* Quote icon background */}
                <Quote className="absolute top-4 right-4 h-12 w-12 text-primary/10 group-hover:text-primary/20 transition-colors" />
                
                {/* Rating */}
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>

                {/* Highlight Badge */}
                <Badge variant="secondary" className="mb-4 bg-primary/10 text-primary border-primary/20">
                  {testimonial.highlight}
                </Badge>

                {/* Testimonial Text */}
                <p className="text-foreground mb-6 relative z-10 leading-relaxed">
                  "{testimonial.text}"
                </p>

                {/* Author */}
                <div className="flex items-center gap-3 mt-auto pt-4 border-t border-border/50">
                  <Avatar className="h-12 w-12 border-2 border-primary/20">
                    <AvatarFallback className="bg-gradient-primary text-white font-bold">
                      {testimonial.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-bold">{testimonial.name}</div>
                    <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Trust indicators */}
        <motion.div
          className="mt-16 flex flex-wrap items-center justify-center gap-8 text-muted-foreground"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <div className="text-center">
            <div className="text-3xl font-bold text-foreground mb-1">50K+</div>
            <div className="text-sm">Active Users</div>
          </div>
          <div className="h-12 w-px bg-border" />
          <div className="text-center">
            <div className="text-3xl font-bold text-foreground mb-1">1M+</div>
            <div className="text-sm">Cards Tracked</div>
          </div>
          <div className="h-12 w-px bg-border" />
          <div className="text-center">
            <div className="text-3xl font-bold text-foreground mb-1">100K+</div>
            <div className="text-sm">Decks Built</div>
          </div>
          <div className="h-12 w-px bg-border" />
          <div className="text-center">
            <div className="text-3xl font-bold text-foreground mb-1">98%</div>
            <div className="text-sm">Satisfaction Rate</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}