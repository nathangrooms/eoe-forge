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
    <section className="py-32 px-4 relative overflow-hidden">
      {/* Background with card frame pattern */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-spacecraft/5 to-background" />
      <div className="absolute inset-0 opacity-5">
        <div className="h-full w-full" style={{
          backgroundImage: `linear-gradient(to right, hsl(var(--primary)) 1px, transparent 1px),
                           linear-gradient(to bottom, hsl(var(--primary)) 1px, transparent 1px)`,
          backgroundSize: '80px 80px'
        }} />
      </div>
      
      <div className="container mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-20">
          <Badge variant="outline" className="mb-8 px-6 py-3 text-sm border-primary/30 bg-primary/10">
            <Star className="h-4 w-4 mr-2 fill-primary" />
            Community Voices
          </Badge>
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-8">
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Loved by Planeswalkers
            </span>
            <br />
            <span className="text-foreground">Everywhere</span>
          </h2>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Join thousands of Magic players who are building smarter with DeckMatrix.
          </p>
        </div>

        {/* Testimonials Grid - Magic Card Style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <Card 
              key={index}
              className="relative group hover:shadow-2xl hover:shadow-primary/20 transition-all duration-500 hover:scale-105 bg-gradient-to-br from-card via-card/90 to-card/80 backdrop-blur-xl border-2 border-border/50 hover:border-primary/50 overflow-hidden"
              style={{
                transformStyle: 'preserve-3d',
                perspective: '1000px'
              }}
            >
              {/* Enhanced glow effect with card frame aesthetic */}
              <div className="absolute inset-0 rounded-lg bg-gradient-primary opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
              
              {/* Corner decorations - like a Magic card */}
              <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-primary/20 rounded-tl-lg group-hover:border-primary/40 transition-colors" />
              <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-primary/20 rounded-br-lg group-hover:border-primary/40 transition-colors" />
              
              <CardContent className="relative z-10 p-8 space-y-6">
                {/* Rating with glow */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star 
                      key={i} 
                      className="h-5 w-5 fill-primary text-primary drop-shadow-[0_0_8px_rgba(162,89,255,0.5)] animate-pulse"
                      style={{ animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </div>

                {/* Quote with better styling */}
                <blockquote className="text-foreground/90 leading-relaxed text-base min-h-[120px]">
                  <span className="text-primary text-3xl leading-none">"</span>
                  {testimonial.content}
                  <span className="text-primary text-3xl leading-none">"</span>
                </blockquote>

                {/* Author with enhanced styling */}
                <div className="flex items-center gap-4 pt-6 border-t-2 border-primary/10">
                  <Avatar className="h-12 w-12 ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all">
                    <AvatarFallback className="bg-gradient-primary text-primary-foreground font-bold text-lg">
                      {testimonial.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold text-foreground text-lg">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      {testimonial.role}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Community Stats - Enhanced */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mt-24">
          <div className="group text-center p-8 rounded-2xl bg-card/40 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all duration-300 hover:scale-105">
            <div className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-3">50,000+</div>
            <p className="text-muted-foreground text-lg">Decks Built</p>
            <div className="w-12 h-1 bg-gradient-primary mx-auto mt-3 rounded-full" />
          </div>
          <div className="group text-center p-8 rounded-2xl bg-card/40 backdrop-blur-sm border border-border/50 hover:border-accent/50 transition-all duration-300 hover:scale-105">
            <div className="text-5xl font-bold text-accent mb-3">100M+</div>
            <p className="text-muted-foreground text-lg">Cards Tracked</p>
            <div className="w-12 h-1 bg-accent mx-auto mt-3 rounded-full" />
          </div>
          <div className="group text-center p-8 rounded-2xl bg-card/40 backdrop-blur-sm border border-border/50 hover:border-type-commander/50 transition-all duration-300 hover:scale-105">
            <div className="text-5xl font-bold text-type-commander mb-3">95%</div>
            <p className="text-muted-foreground text-lg">Player Satisfaction</p>
            <div className="w-12 h-1 bg-type-commander mx-auto mt-3 rounded-full" />
          </div>
        </div>
      </div>
    </section>
  );
}