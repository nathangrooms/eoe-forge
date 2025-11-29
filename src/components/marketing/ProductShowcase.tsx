import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, Package, Target, ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const showcases = [
  {
    id: 'commanders',
    title: 'Commanders',
    subtitle: 'Deck Builder',
    description: 'Build Commander-perfect decks with AI synergy detection and true power-level calibration.',
    icon: Crown,
    color: 'type-commander',
    gradient: 'from-type-commander/20 via-type-commander/5 to-transparent',
    image: '/lovable-uploads/deck-builder-mockup.jpg',
    cta: 'Try Deck Builder',
    link: '/deck-builder',
    features: ['AI Synergy', 'Power Scoring', '60+ Formats']
  },
  {
    id: 'collectors',
    title: 'Collectors',
    subtitle: 'Collection Manager',
    description: 'Organize, scan, and value your collection automatically with real-time market pricing.',
    icon: Package,
    color: 'accent',
    gradient: 'from-accent/20 via-accent/5 to-transparent',
    image: '/lovable-uploads/collection-manager-mockup.jpg',
    cta: 'Scan Collection',
    link: '/collection',
    features: ['Auto-Scan', 'Live Values', 'Portfolio Tracking']
  },
  {
    id: 'champions',
    title: 'Champions',
    subtitle: 'Power Analyzer + AI Coach',
    description: 'Evaluate and improve your decks with professional metrics used by top players.',
    icon: Target,
    color: 'type-enchantments',
    gradient: 'from-type-enchantments/20 via-type-enchantments/5 to-transparent',
    image: '/lovable-uploads/ai-analysis-mockup.jpg',
    cta: 'See Power Analysis',
    link: '/deck-builder?tab=analysis',
    features: ['Power Level', 'Win Rate', 'Meta Analysis']
  }
];

export function ProductShowcase() {
  return (
    <section className="py-32 px-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      <div className="absolute inset-0 bg-gradient-nebula opacity-20" />
      
      <div className="container mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-24">
          <Badge variant="outline" className="mb-8 px-6 py-3 text-sm border-primary/30 bg-primary/10">
            <Sparkles className="h-4 w-4 mr-2" />
            Three Pillars of Mastery
          </Badge>
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-8">
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Built for
            </span>
            <br />
            <span className="text-foreground">Commanders, Collectors & Champions</span>
          </h2>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            Three powerful tools designed for every aspect of your Magic: The Gathering journey.
          </p>
        </div>

        {/* Showcase Panels - Cinematic Layout */}
        <div className="space-y-32">
          {showcases.map((showcase, index) => (
            <div 
              key={showcase.id}
              className={`group relative grid grid-cols-1 lg:grid-cols-2 gap-16 items-center ${
                index % 2 === 1 ? 'lg:grid-flow-dense' : ''
              }`}
            >
              {/* Content Side */}
              <div className={`space-y-8 ${index % 2 === 1 ? 'lg:col-start-2' : ''}`}>
                {/* Icon & Badge */}
                <div className="flex items-center gap-6">
                  <div className={`relative p-5 rounded-3xl bg-gradient-to-br from-${showcase.color}/20 to-${showcase.color}/5 border border-${showcase.color}/30 shadow-glow-subtle group-hover:scale-110 transition-transform duration-500`}>
                    <showcase.icon className={`h-12 w-12 text-${showcase.color}`} />
                    <div className={`absolute inset-0 rounded-3xl bg-${showcase.color}/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                  </div>
                  <div>
                    <div className={`text-sm font-bold text-${showcase.color} uppercase tracking-wider mb-1`}>
                      {showcase.subtitle}
                    </div>
                    <h3 className="text-5xl md:text-6xl font-bold text-foreground">
                      {showcase.title}
                    </h3>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed">
                  {showcase.description}
                </p>

                {/* Feature Tags */}
                <div className="flex flex-wrap gap-3">
                  {showcase.features.map((feature, i) => (
                    <div 
                      key={i} 
                      className={`flex items-center gap-2 px-5 py-3 bg-gradient-to-r ${showcase.gradient} backdrop-blur-sm rounded-full border border-${showcase.color}/20 text-sm font-medium`}
                    >
                      <div className={`w-2 h-2 rounded-full bg-${showcase.color} animate-pulse`} />
                      {feature}
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="pt-6">
                  <Link to={showcase.link}>
                    <Button 
                      size="lg" 
                      className={`group/btn px-10 py-6 text-lg font-bold bg-gradient-to-r ${showcase.gradient} hover:shadow-glow-elegant border-2 border-${showcase.color}/30 hover:border-${showcase.color}/60 transition-all duration-500 hover:scale-105`}
                      variant="outline"
                    >
                      <span className="relative z-10">{showcase.cta}</span>
                      <ArrowRight className="h-5 w-5 ml-3 group-hover/btn:translate-x-2 transition-transform duration-300" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Image/Visual Side with parallax effect */}
              <div className={`${index % 2 === 1 ? 'lg:col-start-1 lg:row-start-1' : ''}`}>
                <div className="relative group/img">
                  {/* Enhanced glow effect */}
                  <div className={`absolute -inset-8 bg-gradient-to-r ${showcase.gradient} blur-3xl opacity-30 group-hover/img:opacity-60 transition-opacity duration-700 rounded-3xl`} />
                  
                  {/* Image container with 3D effect */}
                  <div className="relative rounded-3xl overflow-hidden border-2 border-primary/20 group-hover/img:border-primary/40 shadow-glow-elegant hover:shadow-glow-elegant transition-all duration-500 group-hover/img:scale-[1.02]">
                    <div className="aspect-[4/3] bg-gradient-to-br from-card via-muted/50 to-card/80 backdrop-blur-xl">
                      <img 
                        src={showcase.image} 
                        alt={`${showcase.title} showcase`}
                        className="w-full h-full object-cover opacity-90 group-hover/img:opacity-100 transition-opacity duration-500"
                        onError={(e) => {
                          // Fallback gradient if image doesn't exist
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      {/* Overlay gradient */}
                      <div className={`absolute inset-0 bg-gradient-to-t ${showcase.gradient} opacity-20`} />
                      
                      {/* Floating badge on image */}
                      <div className="absolute top-6 right-6">
                        <Badge className={`bg-${showcase.color}/90 text-${showcase.color}-foreground backdrop-blur-sm border-0 px-4 py-2 text-sm font-bold shadow-lg`}>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Live Feature
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Floating card decoration */}
                  <div className={`absolute -bottom-6 -right-6 w-32 h-32 rounded-2xl bg-gradient-to-br ${showcase.gradient} blur-2xl opacity-50 animate-float`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
