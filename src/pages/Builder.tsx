import { useState } from 'react';
import { TopNavigation } from '@/components/TopNavigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Search,
  Plus,
  BarChart3,
  Target,
  Zap,
  Shield,
  Trash2,
  Settings,
  History,
  Share,
  Download,
  Upload,
  Play
} from 'lucide-react';

export default function Builder() {
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [viewMode, setViewMode] = useState<'build' | 'analysis'>('build');

  return (
    <div className="min-h-screen bg-background">
      <TopNavigation />
      
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left Panel - Card Search & Filters */}
        <div className="w-80 border-r bg-background/95 flex flex-col">
          <div className="p-4 border-b">
            <h2 className="font-semibold mb-4">Card Search</h2>
            
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search cards..."
                className="w-full pl-10 pr-4 py-2 border border-input bg-background rounded-md text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Quick Role Filters */}
            <div className="space-y-2 mb-4">
              <div className="text-sm font-medium">Quick Roles</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'Ramp', icon: Zap },
                  { name: 'Draw', icon: Target },
                  { name: 'Removal', icon: Trash2 },
                  { name: 'Sweepers', icon: Shield },
                ].map((role) => {
                  const Icon = role.icon;
                  return (
                    <Button key={role.name} variant="outline" size="sm" className="justify-start">
                      <Icon className="h-3 w-3 mr-2" />
                      {role.name}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Format & Set Filters */}
            <div className="space-y-3">
              <select className="w-full p-2 border border-input bg-background rounded-md text-sm">
                <option>All Formats</option>
                <option>Standard</option>
                <option>Modern</option>
                <option>Commander</option>
                <option>Legacy</option>
              </select>
              
              <select className="w-full p-2 border border-input bg-background rounded-md text-sm">
                <option>All Sets</option>
                <option>Latest Sets Only</option>
                <option>Standard Legal</option>
              </select>
            </div>
          </div>

          {/* Search Results */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-sm text-muted-foreground mb-2">Search for cards above</div>
            <div className="space-y-2">
              {/* Placeholder for search results */}
              <div className="text-center text-muted-foreground py-8">
                Enter a search term to find cards
              </div>
            </div>
          </div>
        </div>

        {/* Center Panel - Deck Canvas */}
        <div className="flex-1 flex flex-col">
          {/* Deck Header */}
          <div className="p-4 border-b bg-background/95">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold">Untitled Deck</h1>
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <span>Commander • 99 cards</span>
                  <Badge variant="outline">Power: 7.2</Badge>
                  <Badge variant="outline">Legal</Badge>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm">
                  <History className="h-4 w-4 mr-2" />
                  History
                </Button>
                <Button variant="outline" size="sm">
                  <Share className="h-4 w-4 mr-2" />
                  Share
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button size="sm">
                  <Play className="h-4 w-4 mr-2" />
                  Playtest
                </Button>
              </div>
            </div>
          </div>

          {/* Deck Stacks */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {/* Commander Stack */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    Commander
                    <Badge variant="outline">1</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                    <Plus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <div className="text-sm text-muted-foreground">Add Commander</div>
                  </div>
                </CardContent>
              </Card>

              {/* Creatures Stack */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    Creatures
                    <Badge variant="outline">0</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Creature Buckets */}
                    {[
                      { range: '0-1', count: 0 },
                      { range: '2', count: 0 },
                      { range: '3', count: 0 },
                      { range: '4', count: 0 },
                      { range: '5', count: 0 },
                      { range: '6+', count: 0 },
                    ].map((bucket) => (
                      <div key={bucket.range} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{bucket.range} CMC</span>
                        <Badge variant="outline" className="text-xs">
                          {bucket.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Instants */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    Instants
                    <Badge variant="outline">0</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center">
                    <div className="text-xs text-muted-foreground">Drop cards here</div>
                  </div>
                </CardContent>
              </Card>

              {/* Sorceries */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    Sorceries
                    <Badge variant="outline">0</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center">
                    <div className="text-xs text-muted-foreground">Drop cards here</div>
                  </div>
                </CardContent>
              </Card>

              {/* Artifacts */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    Artifacts
                    <Badge variant="outline">0</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center">
                    <div className="text-xs text-muted-foreground">Drop cards here</div>
                  </div>
                </CardContent>
              </Card>

              {/* Enchantments */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    Enchantments
                    <Badge variant="outline">0</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center">
                    <div className="text-xs text-muted-foreground">Drop cards here</div>
                  </div>
                </CardContent>
              </Card>

              {/* Planeswalkers */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    Planeswalkers
                    <Badge variant="outline">0</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center">
                    <div className="text-xs text-muted-foreground">Drop cards here</div>
                  </div>
                </CardContent>
              </Card>

              {/* Lands */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    Lands
                    <Badge variant="outline">0</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center">
                    <div className="text-xs text-muted-foreground">Drop cards here</div>
                  </div>
                </CardContent>
              </Card>

              {/* Sideboard */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    Sideboard
                    <Badge variant="outline">0</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center">
                    <div className="text-xs text-muted-foreground">Drop cards here</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Right Panel - Analysis & Coaching */}
        <div className="w-80 border-l bg-background/95 flex flex-col">
          <div className="p-4 border-b">
            <h2 className="font-semibold mb-4">Analysis</h2>
            
            {/* Analysis Tabs */}
            <div className="flex space-x-2 mb-4">
              <Button
                variant={viewMode === 'build' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('build')}
              >
                Build
              </Button>
              <Button
                variant={viewMode === 'analysis' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('analysis')}
              >
                Analysis
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {viewMode === 'build' ? (
              <div className="space-y-6">
                {/* Mana Curve */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Mana Curve</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((cmc) => (
                        <div key={cmc} className="flex items-center space-x-2">
                          <span className="w-4 text-xs">{cmc}</span>
                          <div className="flex-1 bg-muted rounded-full h-3">
                            <div 
                              className="bg-primary h-3 rounded-full transition-all"
                              style={{ width: '0%' }}
                            />
                          </div>
                          <span className="text-xs w-6">0</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Color Distribution */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Color Sources</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[
                        { color: 'W', name: 'White', needed: 0, sources: 0 },
                        { color: 'U', name: 'Blue', needed: 0, sources: 0 },
                        { color: 'B', name: 'Black', needed: 0, sources: 0 },
                        { color: 'R', name: 'Red', needed: 0, sources: 0 },
                        { color: 'G', name: 'Green', needed: 0, sources: 0 },
                      ].map((color) => (
                        <div key={color.color} className="flex items-center justify-between text-sm">
                          <div className="flex items-center space-x-2">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{
                                backgroundColor: {
                                  W: '#FFFBD5',
                                  U: '#0E68AB', 
                                  B: '#150B00',
                                  R: '#D3202A',
                                  G: '#00733E'
                                }[color.color]
                              }}
                            />
                            <span>{color.name}</span>
                          </div>
                          <span className="text-xs">
                            {color.sources}/{color.needed}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Warnings */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Deck Health</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground text-center py-4">
                      Add cards to see analysis
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Power Score */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Power Score</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center">
                      <div className="text-2xl font-bold">-</div>
                      <div className="text-sm text-muted-foreground">Not enough cards</div>
                    </div>
                  </CardContent>
                </Card>

                {/* Role Meters */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Role Balance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { role: 'Ramp', count: 0, target: 8 },
                        { role: 'Draw', count: 0, target: 10 },
                        { role: 'Removal', count: 0, target: 8 },
                        { role: 'Threats', count: 0, target: 20 },
                      ].map((role) => (
                        <div key={role.role} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{role.role}</span>
                            <span>{role.count}/{role.target}</span>
                          </div>
                          <div className="bg-muted rounded-full h-2">
                            <div 
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${(role.count / role.target) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Bottom Actions */}
          <div className="p-4 border-t space-y-2">
            <Button className="w-full" disabled>
              <BarChart3 className="h-4 w-4 mr-2" />
              Auto-Build
            </Button>
            <Button variant="outline" className="w-full" disabled>
              <Target className="h-4 w-4 mr-2" />
              Optimize Lands
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}