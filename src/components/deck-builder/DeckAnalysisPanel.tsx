import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface DeckAnalysisPanelProps {
  deck: any[];
  format: string;
  commander?: any;
}

const MANA_CURVE_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0', '#87d068'];
const TYPE_COLORS = ['#0088fe', '#00c49f', '#ffbb28', '#ff8042', '#8884d8', '#82ca9d', '#ffc658'];

export function DeckAnalysisPanel({ deck, format, commander }: DeckAnalysisPanelProps) {
  const analysis = useMemo(() => {
    return analyzeDeck(deck, format, commander);
  }, [deck, format, commander]);

  return (
    <div className="space-y-4">
      {/* Mana Curve */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mana Curve</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.manaCurve}>
                <XAxis dataKey="cmc" />
                <YAxis />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Average CMC: {analysis.avgCmc.toFixed(2)}
          </div>
        </CardContent>
      </Card>

      {/* Color Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Color Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analysis.colorDistribution.map((color, index) => (
              <div key={color.color} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center">
                    <div 
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: color.color === 'W' ? '#fff8dc' : 
                                               color.color === 'U' ? '#0066cc' :
                                               color.color === 'B' ? '#2e2e2e' :
                                               color.color === 'R' ? '#ff4444' :
                                               color.color === 'G' ? '#00aa44' : '#d4af37' }}
                    />
                    {color.color === 'C' ? 'Colorless' : color.color}
                  </span>
                  <span>{color.count} cards ({color.percentage.toFixed(1)}%)</span>
                </div>
                <Progress value={color.percentage} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Card Types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Card Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analysis.typeDistribution}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ type, percentage }) => `${type} ${percentage.toFixed(0)}%`}
                >
                  {analysis.typeDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={TYPE_COLORS[index % TYPE_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Deck Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Deck Statistics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Total Cards:</span>
                <span>{deck.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Non-lands:</span>
                <span>{analysis.nonLandCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Lands:</span>
                <span>{analysis.landCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Creatures:</span>
                <span>{analysis.creatureCount}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Instants:</span>
                <span>{analysis.instantCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Sorceries:</span>
                <span>{analysis.sorceryCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Artifacts:</span>
                <span>{analysis.artifactCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Enchantments:</span>
                <span>{analysis.enchantmentCount}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Format Validation */}
          <div className="space-y-2">
            <h4 className="font-medium">Format Validation</h4>
            <div className="flex flex-wrap gap-2">
              {analysis.formatValidation.map((issue, index) => (
                <Badge 
                  key={index} 
                  variant={issue.type === 'error' ? 'destructive' : 'secondary'}
                >
                  {issue.message}
                </Badge>
              ))}
              {analysis.formatValidation.length === 0 && (
                <Badge variant="default">Format legal</Badge>
              )}
            </div>
          </div>

          {/* Color Identity */}
          {commander && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="font-medium">Color Identity</h4>
                <div className="flex items-center space-x-2">
                  <span className="text-sm">Commander:</span>
                  <Badge variant="outline">{commander.name}</Badge>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm">Identity:</span>
                  <div className="flex space-x-1">
                    {(commander.color_identity || []).map((color: string) => (
                      <Badge key={color} variant="outline" className="w-6 h-6 p-0 justify-center">
                        {color}
                      </Badge>
                    ))}
                  </div>
                </div>
                {analysis.colorIdentityViolations.length > 0 && (
                  <div className="text-sm text-destructive">
                    Color identity violations: {analysis.colorIdentityViolations.join(', ')}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="font-medium">Recommendations</h4>
                <ul className="text-sm space-y-1">
                  {analysis.recommendations.map((rec, index) => (
                    <li key={index} className="text-muted-foreground">• {rec}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function analyzeDeck(deck: any[], format: string, commander?: any) {
  const nonLands = deck.filter(card => !card.type_line?.toLowerCase().includes('land'));
  const lands = deck.filter(card => card.type_line?.toLowerCase().includes('land'));

  // Mana curve
  const manaCurve = Array.from({ length: 11 }, (_, i) => ({
    cmc: i === 10 ? '10+' : i.toString(),
    count: nonLands.filter(card => {
      const cmc = card.cmc || 0;
      return i === 10 ? cmc >= 10 : cmc === i;
    }).length
  }));

  // Average CMC
  const avgCmc = nonLands.length > 0 
    ? nonLands.reduce((sum, card) => sum + (card.cmc || 0), 0) / nonLands.length 
    : 0;

  // Color distribution
  const colorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  deck.forEach(card => {
    const colors = card.color_identity || card.colors || [];
    if (colors.length === 0) {
      colorCounts.C++;
    } else {
      colors.forEach((color: string) => {
        if (color in colorCounts) {
          colorCounts[color as keyof typeof colorCounts]++;
        }
      });
    }
  });

  const colorDistribution = Object.entries(colorCounts)
    .filter(([_, count]) => count > 0)
    .map(([color, count]) => ({
      color,
      count,
      percentage: (count / deck.length) * 100
    }));

  // Type distribution
  const typeCounts: Record<string, number> = {};
  deck.forEach(card => {
    const type = card.type_line?.toLowerCase() || '';
    let primaryType = 'Other';
    
    if (type.includes('creature')) primaryType = 'Creature';
    else if (type.includes('instant')) primaryType = 'Instant';
    else if (type.includes('sorcery')) primaryType = 'Sorcery';
    else if (type.includes('artifact')) primaryType = 'Artifact';
    else if (type.includes('enchantment')) primaryType = 'Enchantment';
    else if (type.includes('planeswalker')) primaryType = 'Planeswalker';
    else if (type.includes('land')) primaryType = 'Land';
    
    typeCounts[primaryType] = (typeCounts[primaryType] || 0) + 1;
  });

  const typeDistribution = Object.entries(typeCounts).map(([type, count]) => ({
    type,
    count,
    percentage: (count / deck.length) * 100
  }));

  // Card type counts
  const creatureCount = deck.filter(c => c.type_line?.toLowerCase().includes('creature')).length;
  const instantCount = deck.filter(c => c.type_line?.toLowerCase().includes('instant')).length;
  const sorceryCount = deck.filter(c => c.type_line?.toLowerCase().includes('sorcery')).length;
  const artifactCount = deck.filter(c => c.type_line?.toLowerCase().includes('artifact')).length;
  const enchantmentCount = deck.filter(c => c.type_line?.toLowerCase().includes('enchantment')).length;

  // Format validation
  const formatValidation = [];
  const expectedSize = format === 'commander' ? 100 : 60;
  
  if (deck.length !== expectedSize) {
    formatValidation.push({
      type: 'error',
      message: `Deck size: ${deck.length}/${expectedSize}`
    });
  }

  if (format === 'commander') {
    const commanders = deck.filter(c => 
      c.type_line?.toLowerCase().includes('legendary creature') ||
      c.oracle_text?.toLowerCase().includes('can be your commander')
    );
    
    if (commanders.length !== 1) {
      formatValidation.push({
        type: 'error',
        message: commanders.length === 0 ? 'No commander' : 'Multiple commanders'
      });
    }
  }

  // Color identity violations
  const colorIdentityViolations: string[] = [];
  if (commander && commander.color_identity) {
    const commanderIdentity = commander.color_identity;
    deck.forEach(card => {
      const cardIdentity = card.color_identity || card.colors || [];
      const hasViolation = cardIdentity.some((color: string) => 
        !commanderIdentity.includes(color)
      );
      if (hasViolation) {
        colorIdentityViolations.push(card.name);
      }
    });
  }

  // Recommendations
  const recommendations = [];
  
  if (lands.length < Math.floor(deck.length * 0.35) && format !== 'standard') {
    recommendations.push('Consider adding more lands for consistency');
  }
  
  if (avgCmc > 4) {
    recommendations.push('High mana curve - consider adding more low-cost cards');
  }
  
  if (creatureCount < Math.floor(deck.length * 0.2) && format !== 'control') {
    recommendations.push('Low creature count - consider adding more threats');
  }

  return {
    manaCurve,
    avgCmc,
    colorDistribution,
    typeDistribution,
    nonLandCount: nonLands.length,
    landCount: lands.length,
    creatureCount,
    instantCount,
    sorceryCount,
    artifactCount,
    enchantmentCount,
    formatValidation,
    colorIdentityViolations,
    recommendations
  };
}