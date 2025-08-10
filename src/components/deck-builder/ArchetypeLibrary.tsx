import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Search, 
  Wand2, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Crown,
  Zap,
  Shield,
  Target,
  Book
} from 'lucide-react';
import { getTemplatesForFormat, getFormatRules } from '@/lib/deckbuilder';

interface ArchetypeTemplate {
  id: string;
  name: string;
  description: string;
  formats: string[];
  colors: string[];
  powerLevel: { min: number; max: number };
  requirements: Array<{
    name: string;
    count: number;
    satisfied: boolean;
    examples: string[];
  }>;
  recommendations: Array<{
    name: string;
    count: number;
    satisfied: boolean;
    examples: string[];
  }>;
  packages: Array<{
    name: string;
    description: string;
    cards: string[];
  }>;
}

interface ArchetypeLibraryProps {
  currentFormat: string;
  currentDeck: any[];
  onApplyTemplate: (template: ArchetypeTemplate) => void;
}

export const ArchetypeLibrary = ({ currentFormat, currentDeck, onApplyTemplate }: ArchetypeLibraryProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState(currentFormat);
  const [selectedTemplate, setSelectedTemplate] = useState<ArchetypeTemplate | null>(null);

  // Get templates from the deck builder system
  const availableTemplates = getTemplatesForFormat(selectedFormat);

  // Mock extended template data with validation
  const mockTemplates: ArchetypeTemplate[] = [
    {
      id: 'commander-aristocrats',
      name: 'Aristocrats',
      description: 'Sacrifice creatures for value and drain opponents',
      formats: ['commander'],
      colors: ['B', 'R'],
      powerLevel: { min: 6, max: 8 },
      requirements: [
        {
          name: 'Sacrifice Outlets',
          count: 6,
          satisfied: false,
          examples: ['Viscera Seer', 'Altar of Dementia', 'Goblin Bombardment']
        },
        {
          name: 'Death Triggers',
          count: 8,
          satisfied: true,
          examples: ['Blood Artist', 'Zulaport Cutthroat', 'Mayhem Devil']
        },
        {
          name: 'Token Generators',
          count: 10,
          satisfied: false,
          examples: ['Bitterblossom', 'Ophiomancer', 'Grave Titan']
        }
      ],
      recommendations: [
        {
          name: 'Recursion',
          count: 6,
          satisfied: true,
          examples: ['Reanimate', 'Animate Dead', 'Recurring Nightmare']
        },
        {
          name: 'Card Draw',
          count: 8,
          satisfied: false,
          examples: ['Phyrexian Arena', 'Necropotence', 'Dark Prophecy']
        }
      ],
      packages: [
        {
          name: 'Core Aristocrats',
          description: 'Essential sacrifice and drain effects',
          cards: ['Blood Artist', 'Zulaport Cutthroat', 'Viscera Seer', 'Carrion Feeder']
        },
        {
          name: 'Token Engine',
          description: 'Generate fodder for sacrificing',
          cards: ['Bitterblossom', 'Ophiomancer', 'Grave Titan', 'Endrek Sahr']
        }
      ]
    },
    {
      id: 'standard-aggro',
      name: 'Red Deck Wins',
      description: 'Fast aggressive strategy with burn spells',
      formats: ['standard', 'pioneer'],
      colors: ['R'],
      powerLevel: { min: 5, max: 7 },
      requirements: [
        {
          name: '1-Drop Creatures',
          count: 8,
          satisfied: true,
          examples: ['Monastery Swiftspear', 'Goblin Guide', 'Champion of the Flame']
        },
        {
          name: 'Burn Spells',
          count: 12,
          satisfied: false,
          examples: ['Lightning Bolt', 'Lava Spike', 'Chain Lightning']
        }
      ],
      recommendations: [
        {
          name: 'Haste Creatures',
          count: 16,
          satisfied: true,
          examples: ['Hazoret the Fervent', 'Earthshaker Khenra']
        }
      ],
      packages: [
        {
          name: 'Burn Package',
          description: 'Direct damage spells',
          cards: ['Lightning Bolt', 'Lava Spike', 'Chain Lightning', 'Rift Bolt']
        }
      ]
    },
    {
      id: 'commander-control',
      name: 'Control',
      description: 'Counter spells and board wipes to control the game',
      formats: ['commander'],
      colors: ['U', 'W'],
      powerLevel: { min: 7, max: 9 },
      requirements: [
        {
          name: 'Counterspells',
          count: 12,
          satisfied: false,
          examples: ['Counterspell', 'Force of Will', 'Mana Drain']
        },
        {
          name: 'Board Wipes',
          count: 6,
          satisfied: true,
          examples: ['Wrath of God', 'Supreme Verdict', 'Cyclonic Rift']
        }
      ],
      recommendations: [
        {
          name: 'Card Draw',
          count: 10,
          satisfied: false,
          examples: ['Rhystic Study', 'Mystic Remora', 'Consecrated Sphinx']
        }
      ],
      packages: [
        {
          name: 'Counter Package',
          description: 'Essential counterspells',
          cards: ['Counterspell', 'Swan Song', 'Negate', 'Dovin\'s Veto']
        }
      ]
    }
  ];

  // Filter templates based on search and format
  const filteredTemplates = mockTemplates.filter(template => 
    template.formats.includes(selectedFormat) &&
    (template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
     template.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getRequirementStatus = (satisfied: boolean) => {
    return satisfied ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-red-500" />
    );
  };

  const getTemplateScore = (template: ArchetypeTemplate) => {
    const total = template.requirements.length + template.recommendations.length;
    const satisfied = [...template.requirements, ...template.recommendations].filter(r => r.satisfied).length;
    return Math.round((satisfied / total) * 100);
  };

  const applyTemplate = (template: ArchetypeTemplate) => {
    onApplyTemplate(template);
    setSelectedTemplate(null);
  };

  return (
    <div className="space-y-6">
      {/* Header and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Book className="h-5 w-5 mr-2" />
            Archetype Library
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search archetypes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={selectedFormat} onValueChange={setSelectedFormat}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="commander">Commander</SelectItem>
                <SelectItem value="modern">Modern</SelectItem>
                <SelectItem value="pioneer">Pioneer</SelectItem>
                <SelectItem value="legacy">Legacy</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredTemplates.map((template) => (
          <Card key={template.id} className="group hover:shadow-lg transition-all">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center">
                    {template.formats.includes('commander') && (
                      <Crown className="h-4 w-4 mr-2 text-yellow-500" />
                    )}
                    {template.name}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                </div>
                <Badge 
                  variant={getTemplateScore(template) >= 80 ? 'default' : getTemplateScore(template) >= 50 ? 'secondary' : 'outline'}
                >
                  {getTemplateScore(template)}% match
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Colors and Power Level */}
              <div className="flex items-center justify-between">
                <div className="flex space-x-1">
                  {template.colors.map(color => (
                    <div
                      key={color}
                      className="w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center"
                      style={{
                        backgroundColor: {
                          W: '#FFFBD5', U: '#0E68AB', B: '#150B00', R: '#D3202A', G: '#00733E'
                        }[color],
                        color: color === 'W' ? '#000' : '#fff'
                      }}
                    >
                      {color}
                    </div>
                  ))}
                </div>
                <div className="text-sm text-muted-foreground">
                  Power: {template.powerLevel.min}-{template.powerLevel.max}
                </div>
              </div>

              {/* Requirements Status */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Requirements:</div>
                {template.requirements.slice(0, 3).map((req, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      {getRequirementStatus(req.satisfied)}
                      <span>{req.name}</span>
                    </div>
                    <Badge variant="outline">{req.count}</Badge>
                  </div>
                ))}
                {template.requirements.length > 3 && (
                  <div className="text-xs text-muted-foreground">
                    +{template.requirements.length - 3} more requirements
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedTemplate(
                    selectedTemplate?.id === template.id ? null : template
                  )}
                  className="flex-1"
                >
                  {selectedTemplate?.id === template.id ? 'Hide Details' : 'View Details'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => applyTemplate(template)}
                  disabled={getTemplateScore(template) < 30}
                >
                  <Wand2 className="h-4 w-4 mr-1" />
                  Apply
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Template Details Modal */}
      {selectedTemplate && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{selectedTemplate.name} - Detailed Analysis</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedTemplate(null)}
              >
                ×
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Requirements */}
            <div>
              <h4 className="font-medium mb-3 flex items-center">
                <Target className="h-4 w-4 mr-2" />
                Requirements
              </h4>
              <div className="space-y-3">
                {selectedTemplate.requirements.map((req, index) => (
                  <div key={index} className="border rounded p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {getRequirementStatus(req.satisfied)}
                        <span className="font-medium">{req.name}</span>
                      </div>
                      <Badge variant="outline">{req.count} needed</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Examples: {req.examples.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Packages */}
            <div>
              <h4 className="font-medium mb-3 flex items-center">
                <Zap className="h-4 w-4 mr-2" />
                Starter Packages
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedTemplate.packages.map((pkg, index) => (
                  <div key={index} className="border rounded p-3 space-y-2">
                    <div className="font-medium">{pkg.name}</div>
                    <div className="text-sm text-muted-foreground">{pkg.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {pkg.cards.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Apply Template */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Applying this template will guide card selection and provide package suggestions. 
                Your current deck has a {getTemplateScore(selectedTemplate)}% compatibility match.
              </AlertDescription>
            </Alert>

            <Button onClick={() => applyTemplate(selectedTemplate)} className="w-full">
              <Wand2 className="h-4 w-4 mr-2" />
              Apply {selectedTemplate.name} Template
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {filteredTemplates.length === 0 && (
        <Card className="p-12 text-center">
          <Search className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-medium mb-2">No Templates Found</h3>
          <p className="text-muted-foreground">
            Try adjusting your search terms or selecting a different format.
          </p>
        </Card>
      )}
    </div>
  );
};