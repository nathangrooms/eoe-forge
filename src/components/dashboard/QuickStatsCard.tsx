import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface QuickStatsCardProps {
  title: string;
  value: string | number;
  change?: number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  highlight?: boolean;
}

export function QuickStatsCard({ 
  title, 
  value, 
  change, 
  subtitle, 
  icon, 
  color,
  highlight 
}: QuickStatsCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`relative overflow-hidden hover:shadow-lg transition-all group ${highlight ? 'ring-2 ring-primary' : ''}`}>
        <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${color}`} />
        {highlight && (
          <div className="absolute top-2 right-2">
            <Badge variant="secondary" className="bg-primary/20 text-primary gap-1">
              <Sparkles className="h-3 w-3" />
              New
            </Badge>
          </div>
        )}
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className={`p-3 rounded-lg ${color.replace('from-', 'bg-').replace('to-', '').split(' ')[0]}/10`}>
              {icon}
            </div>
            {change !== undefined && (
              <div className={`flex items-center gap-1 text-sm font-medium ${
                change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {change >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {Math.abs(change)}%
              </div>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
