import { useEffect, useState } from 'react';
import { TrendingUp, Users, Database, Globe } from 'lucide-react';

const stats = [
  {
    icon: Database,
    value: 50000,
    suffix: '+',
    label: 'Decks Built',
    color: 'primary',
    duration: 2000
  },
  {
    icon: Users,
    value: 1200000,
    suffix: '+',
    label: 'Cards Managed',
    color: 'accent',
    duration: 2500,
    format: (val: number) => `${(val / 1000000).toFixed(1)}M`
  },
  {
    icon: TrendingUp,
    value: 95,
    suffix: '%',
    label: 'User Retention',
    color: 'type-commander',
    duration: 1500
  },
  {
    icon: Globe,
    value: 100,
    suffix: '+',
    label: 'Formats Supported',
    color: 'type-enchantments',
    duration: 1800
  }
];

interface AnimatedStatProps {
  value: number;
  duration: number;
  format?: (val: number) => string;
  suffix: string;
}

function AnimatedStat({ value, duration, format, suffix }: AnimatedStatProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    const startValue = 0;
    const endValue = value;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentCount = Math.floor(startValue + (endValue - startValue) * easeOutQuart);
      
      setCount(currentCount);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );

    const element = document.getElementById(`stat-${value}`);
    if (element) observer.observe(element);

    return () => {
      if (element) observer.unobserve(element);
    };
  }, [value, duration]);

  return (
    <span id={`stat-${value}`}>
      {format ? format(count) : count.toLocaleString()}{suffix}
    </span>
  );
}

export function LiveStats() {
  return (
    <section className="py-32 px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      
      {/* Decorative grid */}
      <div className="absolute inset-0 opacity-5">
        <div className="h-full w-full" style={{
          backgroundImage: `radial-gradient(circle at center, hsl(var(--primary)) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }} />
      </div>

      <div className="container mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-8">
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              The Numbers
            </span>
            <br />
            <span className="text-foreground">Behind the Magic</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Join thousands of players who trust DeckMatrix for their MTG journey
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="group relative overflow-hidden rounded-3xl bg-card/60 backdrop-blur-sm border border-border/50 hover:border-primary/50 p-8 transition-all duration-500 hover:scale-105 hover:shadow-glow-elegant"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Background glow effect */}
              <div className={`absolute inset-0 bg-gradient-to-br from-${stat.color}/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
              
              {/* Particle burst effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={`absolute w-1 h-1 rounded-full bg-${stat.color} animate-ping`}
                    style={{
                      top: `${Math.random() * 100}%`,
                      left: `${Math.random() * 100}%`,
                      animationDelay: `${i * 0.2}s`,
                      animationDuration: '2s'
                    }}
                  />
                ))}
              </div>

              <div className="relative z-10 space-y-6">
                {/* Icon */}
                <div className={`w-16 h-16 rounded-2xl bg-${stat.color}/10 flex items-center justify-center group-hover:bg-${stat.color}/20 transition-all duration-300 group-hover:scale-110`}>
                  <stat.icon className={`h-8 w-8 text-${stat.color}`} />
                </div>

                {/* Value */}
                <div>
                  <div className={`text-5xl md:text-6xl font-bold text-${stat.color} mb-2 tabular-nums`}>
                    <AnimatedStat
                      value={stat.value}
                      duration={stat.duration}
                      format={stat.format}
                      suffix={stat.suffix}
                    />
                  </div>
                  <div className="text-lg text-muted-foreground font-medium">
                    {stat.label}
                  </div>
                </div>

                {/* Trend indicator */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className={`w-2 h-2 rounded-full bg-${stat.color} animate-pulse`} />
                  <span>Live data</span>
                </div>
              </div>

              {/* Corner decoration */}
              <div className={`absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-${stat.color}/10 blur-2xl group-hover:bg-${stat.color}/20 transition-colors duration-500`} />
            </div>
          ))}
        </div>

        {/* Bottom text */}
        <div className="text-center mt-20">
          <p className="text-muted-foreground text-lg">
            Real-time statistics updated continuously from our community
          </p>
        </div>
      </div>
    </section>
  );
}
