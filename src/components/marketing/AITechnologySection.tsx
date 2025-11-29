import { Badge } from '@/components/ui/badge';
import { Sparkles, Zap, Globe, Link as LinkIcon, Crown } from 'lucide-react';

const technologies = [
  {
    icon: Crown,
    label: 'AI Builder',
    description: 'Neural deck construction',
    color: 'primary'
  },
  {
    icon: Zap,
    label: 'Power Calculator',
    description: 'Competitive metrics',
    color: 'accent'
  },
  {
    icon: Globe,
    label: 'Land Optimizer',
    description: 'Manabase perfection',
    color: 'type-lands'
  },
  {
    icon: LinkIcon,
    label: 'Synergy Engine',
    description: 'Card relationships',
    color: 'type-enchantments'
  }
];

export function AITechnologySection() {
  return (
    <section className="py-32 px-4 relative overflow-hidden">
      {/* Background with code-like pattern */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card to-background" />
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(0deg, hsl(var(--primary)) 0px, transparent 1px, transparent 40px),
                           repeating-linear-gradient(90deg, hsl(var(--primary)) 0px, transparent 1px, transparent 40px)`
        }} />
      </div>

      <div className="container mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-20">
          <Badge variant="outline" className="mb-8 px-6 py-3 text-sm border-primary/30 bg-primary/10">
            <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
            Advanced Intelligence
          </Badge>
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-8">
            <span className="text-foreground">Powered by Real Magic:</span>
            <br />
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              The AI Engine
            </span>
          </h2>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-5xl mx-auto leading-relaxed">
            DeckMatrix combines competitive deck theory, real-time data from Scryfall, 
            and advanced AI synergy detection — creating decks that actually win.
          </p>
        </div>

        {/* Visual representation of AI + Magic */}
        <div className="max-w-6xl mx-auto mb-20">
          <div className="relative h-[400px] rounded-3xl bg-gradient-to-br from-card via-muted/50 to-card border border-primary/20 overflow-hidden shadow-glow-elegant">
            {/* Animated code-like background */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute top-10 left-10 text-primary/30 font-mono text-xs space-y-2 animate-fade-in">
                <div>{'// Analyzing deck synergies...'}</div>
                <div>{'const powerLevel = calculateEDH(deck);'}</div>
                <div>{'if (powerLevel > 7) optimize();'}</div>
              </div>
              <div className="absolute top-32 right-10 text-accent/30 font-mono text-xs space-y-2 animate-fade-in" style={{ animationDelay: '0.5s' }}>
                <div>{'// Scryfall API Integration'}</div>
                <div>{'fetchCardData(oracleId);'}</div>
                <div>{'updatePricing(realtime);'}</div>
              </div>
              <div className="absolute bottom-10 left-1/4 text-type-enchantments/30 font-mono text-xs space-y-2 animate-fade-in" style={{ animationDelay: '1s' }}>
                <div>{'// Synergy Detection'}</div>
                <div>{'detectCombos(cardPool);'}</div>
                <div>{'return optimalPicks;'}</div>
              </div>
            </div>

            {/* Center visualization */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                {/* Core orb */}
                <div className="relative w-48 h-48 rounded-full bg-gradient-cosmic animate-glow shadow-glow-elegant">
                  <div className="absolute inset-4 rounded-full bg-background/50 backdrop-blur-xl border border-primary/40 flex items-center justify-center">
                    <Sparkles className="h-16 w-16 text-primary animate-pulse" />
                  </div>
                </div>

                {/* Orbiting mana symbols */}
                <div className="absolute inset-0 animate-[spin_20s_linear_infinite]">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-mana-white/30 backdrop-blur-sm flex items-center justify-center border border-mana-white/40">
                    <span className="text-lg">⚪</span>
                  </div>
                </div>
                <div className="absolute inset-0 animate-[spin_20s_linear_infinite]" style={{ animationDelay: '-4s' }}>
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-mana-blue/30 backdrop-blur-sm flex items-center justify-center border border-mana-blue/40">
                    <span className="text-lg">🔵</span>
                  </div>
                </div>
                <div className="absolute inset-0 animate-[spin_20s_linear_infinite]" style={{ animationDelay: '-8s' }}>
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-mana-black/30 backdrop-blur-sm flex items-center justify-center border border-mana-black/40">
                    <span className="text-lg">⚫</span>
                  </div>
                </div>
                <div className="absolute inset-0 animate-[spin_20s_linear_infinite]" style={{ animationDelay: '-12s' }}>
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-mana-red/30 backdrop-blur-sm flex items-center justify-center border border-mana-red/40">
                    <span className="text-lg">🔴</span>
                  </div>
                </div>
                <div className="absolute inset-0 animate-[spin_20s_linear_infinite]" style={{ animationDelay: '-16s' }}>
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-mana-green/30 backdrop-blur-sm flex items-center justify-center border border-mana-green/40">
                    <span className="text-lg">🟢</span>
                  </div>
                </div>

                {/* Connecting lines */}
                <div className="absolute inset-0 opacity-20">
                  {[...Array(8)].map((_, i) => (
                    <div 
                      key={i}
                      className="absolute top-1/2 left-1/2 w-full h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
                      style={{ transform: `rotate(${i * 45}deg)` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Technology chips grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {technologies.map((tech, index) => (
            <div 
              key={index}
              className="group relative overflow-hidden rounded-2xl bg-card/60 backdrop-blur-sm border border-border/50 hover:border-primary/50 p-6 transition-all duration-500 hover:scale-105 hover:shadow-glow-subtle"
            >
              <div className={`absolute inset-0 bg-gradient-to-br from-${tech.color}/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
              
              <div className="relative z-10 space-y-4">
                <div className={`w-14 h-14 rounded-2xl bg-${tech.color}/10 flex items-center justify-center group-hover:bg-${tech.color}/20 transition-colors duration-300`}>
                  <tech.icon className={`h-7 w-7 text-${tech.color}`} />
                </div>
                <div>
                  <div className="font-bold text-foreground mb-1">{tech.label}</div>
                  <div className="text-sm text-muted-foreground">{tech.description}</div>
                </div>
              </div>

              {/* Corner accent */}
              <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-${tech.color}/20 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
