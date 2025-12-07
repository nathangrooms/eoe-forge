// Premium overview tab with comprehensive deck analysis display
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  AlertTriangle, 
  CheckCircle, 
  Lightbulb, 
  Target, 
  Zap, 
  TrendingUp,
  Shield,
  Flame,
  Droplets
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface AnalysisIssue {
  card: string;
  reason: string;
  severity: 'high' | 'medium' | 'low';
  category?: string;
}

interface AnalysisResult {
  summary: string;
  issues: AnalysisIssue[];
  strengths: Array<{ text: string }>;
  strategy: Array<{ text: string }>;
  manabase: Array<{ text: string }>;
  deckScore?: number;
  categories?: {
    synergy: number;
    consistency: number;
    power: number;
    interaction: number;
    manabase: number;
  };
}

interface OptimizerOverviewProps {
  analysis: AnalysisResult;
  replacementCount: number;
  additionCount: number;
}

export function OptimizerOverview({ analysis, replacementCount, additionCount }: OptimizerOverviewProps) {
  const categories = analysis.categories || {
    synergy: 70,
    consistency: 65,
    power: 75,
    interaction: 60,
    manabase: 80
  };

  const categoryIcons = {
    synergy: <Zap className="h-4 w-4" />,
    consistency: <Target className="h-4 w-4" />,
    power: <Flame className="h-4 w-4" />,
    interaction: <Shield className="h-4 w-4" />,
    manabase: <Droplets className="h-4 w-4" />
  };

  const categoryColors = {
    synergy: 'text-purple-400',
    consistency: 'text-blue-400',
    power: 'text-orange-400',
    interaction: 'text-green-400',
    manabase: 'text-cyan-400'
  };

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'high': return { bg: 'bg-destructive/20', border: 'border-destructive/30', text: 'text-destructive', icon: '🔴' };
      case 'medium': return { bg: 'bg-orange-500/20', border: 'border-orange-500/30', text: 'text-orange-400', icon: '🟠' };
      case 'low': return { bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: '🟡' };
      default: return { bg: 'bg-muted', border: 'border-border', text: 'text-muted-foreground', icon: '⚪' };
    }
  };

  const overallScore = Math.round(Object.values(categories).reduce((a, b) => a + b, 0) / 5);

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start gap-6">
              {/* Score Circle */}
              <div className="relative flex-shrink-0">
                <svg className="w-24 h-24 transform -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-muted/30"
                  />
                  <motion.circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="url(#scoreGradient)"
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    initial={{ strokeDasharray: '0 251.2' }}
                    animate={{ strokeDasharray: `${(overallScore / 100) * 251.2} 251.2` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                  <defs>
                    <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="hsl(var(--primary))" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <span className="text-2xl font-bold">{overallScore}</span>
                    <span className="text-xs text-muted-foreground block">/100</span>
                  </div>
                </div>
              </div>

              {/* Summary Text */}
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2">Deck Analysis</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {analysis.summary || 'Your deck has been analyzed. See detailed breakdown below.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {replacementCount > 0 && (
                    <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                      {replacementCount} suggested swaps
                    </Badge>
                  )}
                  {additionCount > 0 && (
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                      {additionCount} cards to add
                    </Badge>
                  )}
                  {analysis.issues.filter(i => i.severity === 'high').length > 0 && (
                    <Badge className="bg-destructive/20 text-destructive border-destructive/30">
                      {analysis.issues.filter(i => i.severity === 'high').length} critical issues
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Category Scores */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardContent className="p-6">
            <h4 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Category Breakdown
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {Object.entries(categories).map(([key, value], index) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className="p-3 rounded-lg bg-muted/50 border"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={categoryColors[key as keyof typeof categoryColors]}>
                      {categoryIcons[key as keyof typeof categoryIcons]}
                    </span>
                    <span className="text-sm font-medium capitalize">{key}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={value} className="h-2 flex-1" />
                    <span className="text-sm font-semibold w-8">{value}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Issues */}
      {analysis.issues.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardContent className="p-6">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-400" />
                Issues Found ({analysis.issues.length})
              </h4>
              <div className="space-y-3">
                {analysis.issues.map((issue, i) => {
                  const style = getSeverityStyles(issue.severity);
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.05 }}
                      className={cn("p-4 rounded-lg border", style.bg, style.border)}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-lg">{style.icon}</span>
                        <div className="flex-1">
                          <span className={cn("font-semibold", style.text)}>{issue.card}</span>
                          <p className="text-sm text-muted-foreground mt-0.5">{issue.reason}</p>
                        </div>
                        {issue.category && (
                          <Badge variant="secondary" className="text-xs">
                            {issue.category}
                          </Badge>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Strengths & Tips Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Strengths */}
        {analysis.strengths.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="h-full">
              <CardContent className="p-6">
                <h4 className="font-semibold mb-4 flex items-center gap-2 text-green-400">
                  <CheckCircle className="h-5 w-5" />
                  Strengths
                </h4>
                <ul className="space-y-3">
                  {analysis.strengths.map((s, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.05 }}
                      className="flex items-start gap-3 text-sm"
                    >
                      <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{s.text}</span>
                    </motion.li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Strategy Tips */}
        {analysis.strategy.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Card className="h-full">
              <CardContent className="p-6">
                <h4 className="font-semibold mb-4 flex items-center gap-2 text-blue-400">
                  <Lightbulb className="h-5 w-5" />
                  Strategy Tips
                </h4>
                <ul className="space-y-3">
                  {analysis.strategy.map((s, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.35 + i * 0.05 }}
                      className="flex items-start gap-3 text-sm"
                    >
                      <Lightbulb className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{s.text}</span>
                    </motion.li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Manabase Notes */}
      {analysis.manabase.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardContent className="p-6">
              <h4 className="font-semibold mb-4 flex items-center gap-2 text-cyan-400">
                <Droplets className="h-5 w-5" />
                Mana Base Analysis
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {analysis.manabase.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 + i * 0.05 }}
                    className="p-3 rounded-lg bg-muted/50 border text-sm text-muted-foreground"
                  >
                    {m.text}
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
