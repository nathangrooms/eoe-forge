import { useEffect, useState } from 'react';
import { TrendingUp, Users, Database, Globe } from 'lucide-react';
import { motion } from 'framer-motion';

const stats = [
  {
    icon: Database,
    value: 50000,
    suffix: '+',
    label: 'Decks Built',
    gradient: 'from-purple-500 to-pink-500',
    duration: 2000
  },
  {
    icon: Users,
    value: 1200000,
    suffix: '+',
    label: 'Cards Managed',
    gradient: 'from-green-500 to-emerald-500',
    duration: 2500,
    format: (val: number) => `${(val / 1000000).toFixed(1)}M`
  },
  {
    icon: TrendingUp,
    value: 95,
    suffix: '%',
    label: 'User Retention',
    gradient: 'from-yellow-500 to-orange-500',
    duration: 1500
  },
  {
    icon: Globe,
    value: 100,
    suffix: '+',
    label: 'Formats Supported',
    gradient: 'from-blue-500 to-cyan-500',
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

export function FixedLiveStats() {
  return (
    <section className="py-16 sm:py-24 px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      
      <div className="container mx-auto relative z-10">
        {/* Header */}
        <motion.div 
          className="text-center mb-12 sm:mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6">
            <span className="bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 bg-clip-text text-transparent">
              Trusted by Thousands
            </span>
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Join a growing community of MTG players
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-6xl mx-auto">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group relative overflow-hidden rounded-2xl bg-card/60 backdrop-blur-sm border border-border/50 hover:border-primary/50 p-6 sm:p-8 transition-all duration-500 hover:scale-105 hover:shadow-glow-subtle"
            >
              {/* Background glow effect */}
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
              
              <div className="relative z-10 space-y-4">
                {/* Icon */}
                <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                  <stat.icon className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </div>

                {/* Value */}
                <div>
                  <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-1 tabular-nums">
                    <AnimatedStat
                      value={stat.value}
                      duration={stat.duration}
                      format={stat.format}
                      suffix={stat.suffix}
                    />
                  </div>
                  <div className="text-sm sm:text-base text-muted-foreground font-medium">
                    {stat.label}
                  </div>
                </div>

                {/* Live indicator */}
                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${stat.gradient} animate-pulse`} />
                  <span>Live</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
