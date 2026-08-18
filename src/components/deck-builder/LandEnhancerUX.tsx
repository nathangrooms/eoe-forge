import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Map, 
  Target, 
  TrendingUp, 
  ArrowRight, 
  Zap,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

interface ColorHitTarget {
  turn: number;
  requirement: string;
  current: number;
  target: number;
  status: 'good' | 'warning' | 'poor';
}

interface LandSuggestion {
  id: string;
  description: string;
  changes: Array<{ from: string; to: string; count: number }>;
  expectedGain: number;
  cost: 'budget' | 'premium';
}

export const LandEnhancerUX = () => {
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);

  // Mock data for color hit analysis
  const colorHitTargets: ColorHitTarget[] = [
    {
      turn: 1,
      requirement: '1 white source',
      current: 78,
      target: 85,
      status: 'warning'
    },
    {
      turn: 2,
      requirement: '1W + 1U',
      current: 82,
      target: 80,
      status: 'good'
    },
    {
      turn: 3,
      requirement: 'WWU or UUW',
      current: 65,
      target: 75,
      status: 'poor'
    }
  ];

  const landSuggestions: LandSuggestion[] = [
    {
      id: '1',
      description: 'Upgrade to untapped duals',
      changes: [
        { from: 'Temple of Enlightenment', to: 'Hallowed Fountain', count: 2 },
        { from: 'Azorius Chancery', to: 'Flooded Strand', count: 2 }
      ],
      expectedGain: 8.5,
      cost: 'premium'
    },
    {
      id: '2',
      description: 'Add more white sources',
      changes: [
        { from: 'Island', to: 'Plains', count: 1 },
        { from: 'Lonely Sandbar', to: 'Secluded Steppe', count: 1 }
      ],
      expectedGain: 6.2,
      cost: 'budget'
    },
    {
      id: '3',
      description: 'Optimize for early plays',
      changes: [
        { from: 'Temple of Enlightenment', to: 'Glacial Fortress', count: 3 },
        { from: 'Tranquil Cove', to: 'Port Town', count: 2 }
      ],
      expectedGain: 5.8,
      cost: 'budget'
    }
  ];

  const applySuggestion = (suggestionId: string) => {
    const suggestion = landSuggestions.find(s => s.id === suggestionId);
    if (!suggestion) return;

    // Here you would apply the land changes to the deck
    console.log('Applying suggestion:', suggestion);
    
    // Show success message
    alert(`Applied suggestion: ${suggestion.description}\nExpected improvement: +${suggestion.expectedGain}%`);
  };

  const getStatusColor = (status: ColorHitTarget['status']) => {
    switch (status) {
      case 'good': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'poor': return 'text-red-500';
    }
  };

  const getStatusIcon = (status: ColorHitTarget['status']) => {
    switch (status) {
      case 'good': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'poor': return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Color Hit Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Target className="h-5 w-5 mr-2" />
            Color Requirements Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {colorHitTargets.map((target, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getStatusIcon(target.status)}
                  <span className="text-sm font-medium">Turn {target.turn}</span>
                  <span className="text-sm text-muted-foreground">{target.requirement}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`text-sm font-medium ${getStatusColor(target.status)}`}>
                    {target.current}%
                  </span>
                  <span className="text-xs text-muted-foreground">/ {target.target}%</span>
                </div>
              </div>
              <Progress 
                value={(target.current / target.target) * 100} 
                className="h-2"
              />
              {target.current < target.target && (
                <div className="text-xs text-muted-foreground">
                  Need {(target.target - target.current).toFixed(1)}% improvement
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Land Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Map className="h-5 w-5 mr-2" />
            Manabase Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {landSuggestions.map((suggestion) => (
            <div key={suggestion.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span className="font-medium">{suggestion.description}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={suggestion.cost === 'premium' ? 'default' : 'secondary'}>
                    {suggestion.cost}
                  </Badge>
                  <Badge variant="outline" className="text-green-600">
                    +{suggestion.expectedGain}%
                  </Badge>
                </div>
              </div>

              {/* Changes Detail */}
              <div className="space-y-2">
                {suggestion.changes.map((change, index) => (
                  <div key={index} className="flex items-center justify-between text-sm bg-muted/30 p-2 rounded">
                    <div className="flex items-center space-x-2">
                      <span className="text-muted-foreground">{change.count}x</span>
                      <span>{change.from}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{change.to}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => setSelectedSuggestion(
                    selectedSuggestion === suggestion.id ? null : suggestion.id
                  )}
                  variant="outline"
                >
                  {selectedSuggestion === suggestion.id ? 'Hide Details' : 'View Details'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => applySuggestion(suggestion.id)}
                >
                  Apply Suggestion
                </Button>
              </div>

              {/* Detailed Analysis */}
              {selectedSuggestion === suggestion.id && (
                <Alert>
                  <Zap className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <div className="font-medium">Expected Impact:</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>T1 white source: +{(suggestion.expectedGain * 0.4).toFixed(1)}%</div>
                        <div>T2 two-color: +{(suggestion.expectedGain * 0.6).toFixed(1)}%</div>
                        <div>T3 intensive: +{(suggestion.expectedGain * 0.8).toFixed(1)}%</div>
                        <div>Average speed: +0.2 turns</div>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Overall Manabase Score */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Manabase Quality Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Current Score</span>
              <Badge variant="default" className="bg-primary">7.2/10</Badge>
            </div>
            <Progress value={72} className="h-2" />
            <div className="text-xs text-muted-foreground">
              Good manabase with room for optimization. Focus on early game consistency.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};