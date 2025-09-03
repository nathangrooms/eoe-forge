import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Star } from 'lucide-react';

const testimonials = [
  {
    name: 'Alex Chen',
    role: 'Competitive Player',
    content: 'DeckMatrix helped me optimize my Modern deck and climb from Gold to Diamond in just two weeks. The AI suggestions are incredibly accurate.',
    rating: 5,
    avatar: 'AC'
  },
  {
    name: 'Sarah Martinez',
    role: 'Commander Enthusiast',
    content: 'Managing my collection has never been easier. The value tracking feature saved me hundreds when trading up for expensive cards.',
    rating: 5,
    avatar: 'SM'
  },
  {
    name: 'Jordan Kim',
    role: 'LGS Owner',
    content: 'I recommend DeckMatrix to all my customers. The power level scoring helps players find balanced games and build better decks.',
    rating: 5,
    avatar: 'JK'
  }
];

export function Testimonials() {
  return (
    <section className="py-24 px-4 bg-gradient-to-b from-spacecraft/5 via-station/5 to-background">
      <div className="container mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Loved by Planeswalkers Everywhere
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Join thousands of Magic players who are building smarter with DeckMatrix.
          </p>
          <Badge variant="outline" className="text-spacecraft border-spacecraft/30">
            Join thousands of Planeswalkers already building smarter
          </Badge>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <Card 
              key={index}
              className="relative group hover:shadow-xl hover:shadow-spacecraft/10 transition-all duration-300 bg-card/50 backdrop-blur-sm border-border/50 hover:border-spacecraft/30"
            >
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-spacecraft/5 to-station/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              <CardContent className="relative z-10 p-6 space-y-4">
                {/* Rating */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-spacecraft text-spacecraft" />
                  ))}
                </div>

                {/* Quote */}
                <blockquote className="text-foreground leading-relaxed">
                  "{testimonial.content}"
                </blockquote>

                {/* Author */}
                <div className="flex items-center gap-3 pt-4 border-t border-border/50">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-spacecraft/20 text-spacecraft font-semibold">
                      {testimonial.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-foreground">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Community Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto mt-16">
          <div className="text-center">
            <div className="text-3xl font-bold text-spacecraft mb-2">50,000+</div>
            <p className="text-muted-foreground">Decks Built</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-station mb-2">100M+</div>
            <p className="text-muted-foreground">Cards Tracked</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-warp mb-2">95%</div>
            <p className="text-muted-foreground">Player Satisfaction</p>
          </div>
        </div>
      </div>
    </section>
  );
}