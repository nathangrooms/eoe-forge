import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  Target, 
  Palette, 
  Cpu,
  TrendingUp,
  Rocket,
  Globe,
  Zap,
  Activity
} from 'lucide-react';

export const AnalysisPanel = () => {
  // Mock data for demonstration
  const mockAnalysis = {
    curve: [
      { cmc: 0, count: 1 },
      { cmc: 1, count: 3 },
      { cmc: 2, count: 8 },
      { cmc: 3, count: 12 },
      { cmc: 4, count: 7 },
      { cmc: 5, count: 4 },
      { cmc: 6, count: 2 },
      { cmc: 7, count: 1 }
    ],
    colors: {
      W: 12,
      U: 18,
      B: 8,
      R: 3,
      G: 5
    },
    mechanics: {
      spacecraft: 6,
      station: 4,
      warp: 8,
      void: 5,
      planet: 3
    },
    roles: {
      ramp: 6,
      draw: 8,
      removal: 10,
      protection: 4,
      finishers: 3,
      synergy: 12
    }
  };

  const maxCurveCount = Math.max(...mockAnalysis.curve.map(c => c.count));
  const totalColorSources = Object.values(mockAnalysis.colors).reduce((sum, count) => sum + count, 0);

  return (
    <div className="space-y-6">
      {/* Mana Curve */}
      <Card className="cosmic-glow">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-primary" />
            Mana Curve
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mockAnalysis.curve.map((point) => (
              <div key={point.cmc} className="flex items-center space-x-3">
                <span className="text-sm font-medium w-6">{point.cmc}</span>
                <div className="flex-1">
                  <Progress 
                    value={(point.count / maxCurveCount) * 100} 
                    className="h-3"
                  />
                </div>
                <span className="text-sm text-muted-foreground w-6">{point.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            Average CMC: 3.2 • Peak: 3 CMC
          </div>
        </CardContent>
      </Card>

      {/* Analysis Tabs */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="colors" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="colors" className="text-xs">Colors</TabsTrigger>
              <TabsTrigger value="mechanics" className="text-xs">EOE</TabsTrigger>
              <TabsTrigger value="roles" className="text-xs">Roles</TabsTrigger>
            </TabsList>
            
            <TabsContent value="colors" className="p-4 space-y-3">
              <div className="flex items-center space-x-2 mb-3">
                <Palette className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Color Distribution</span>
              </div>
              {Object.entries(mockAnalysis.colors).map(([color, count]) => (
                <div key={color} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div 
                      className="w-4 h-4 rounded-full border"
                      style={{
                        backgroundColor: {
                          W: '#FFFBD5',
                          U: '#0E68AB', 
                          B: '#150B00',
                          R: '#D3202A',
                          G: '#00733E'
                        }[color]
                      }}
                    />
                    <span className="text-sm">{color}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium">{count}</span>
                    <span className="text-xs text-muted-foreground">
                      ({Math.round((count / totalColorSources) * 100)}%)
                    </span>
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="mechanics" className="p-4 space-y-3">
              <div className="flex items-center space-x-2 mb-3">
                <Cpu className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">EOE Mechanics</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Rocket className="h-4 w-4 text-spacecraft" />
                    <span className="text-sm">Spacecraft</span>
                  </div>
                  <Badge variant="outline" className="text-spacecraft border-spacecraft/30">
                    {mockAnalysis.mechanics.spacecraft}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Cpu className="h-4 w-4 text-station" />
                    <span className="text-sm">Station</span>
                  </div>
                  <Badge variant="outline" className="text-station border-station/30">
                    {mockAnalysis.mechanics.station}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4 text-warp" />
                    <span className="text-sm">Warp</span>
                  </div>
                  <Badge variant="outline" className="text-warp border-warp/30">
                    {mockAnalysis.mechanics.warp}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Activity className="h-4 w-4 text-void" />
                    <span className="text-sm">Void</span>
                  </div>
                  <Badge variant="outline" className="text-void border-void/30">
                    {mockAnalysis.mechanics.void}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Globe className="h-4 w-4 text-planet" />
                    <span className="text-sm">Planet</span>
                  </div>
                  <Badge variant="outline" className="text-planet border-planet/30">
                    {mockAnalysis.mechanics.planet}
                  </Badge>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="roles" className="p-4 space-y-3">
              <div className="flex items-center space-x-2 mb-3">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Deck Roles</span>
              </div>
              {Object.entries(mockAnalysis.roles).map(([role, count]) => (
                <div key={role} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{role}</span>
                  <Badge variant="outline">{count}</Badge>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Power Level Indicator */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center">
            <TrendingUp className="h-4 w-4 mr-2 text-primary" />
            Deck Strength
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Power Level</span>
              <Badge variant="default" className="bg-primary">7/10</Badge>
            </div>
            <Progress value={70} className="h-2" />
            <div className="text-xs text-muted-foreground">
              High-power competitive deck with strong synergies and efficient curve.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};