import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Loader2, Wand2, Download, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDeckStore } from '@/stores/deckStore';

interface BuildRequest {
  format: string;
  colors?: string[];
  identity?: string[];
  themeId?: string;
  powerTarget: number;
  budget?: 'low' | 'med' | 'high';
  seed?: number;
}

interface ChangelogEntry {
  action: 'add' | 'remove' | 'swap';
  card: string;
  reason: string;
  stage: string;
}

interface BuildResult {
  decklist: any[];
  power: number;
  subscores: Record<string, number>;
  analysis: string;
  changelog: ChangelogEntry[];
}

export function DeterministicAIBuilder() {
  const { toast } = useToast();
  const { importDeck, setFormat, setDeckName } = useDeckStore();
  
  const [buildRequest, setBuildRequest] = useState<BuildRequest>({
    format: 'commander',
    colors: [],
    powerTarget: 6,
    budget: 'med',
    themeId: 'midrange'
  });
  
  const [isBuilding, setIsBuilding] = useState(false);
  const [lastResult, setLastResult] = useState<BuildResult | null>(null);

  const buildDeck = async () => {
    setIsBuilding(true);
    
    try {
      console.log('Sending build request:', buildRequest);
      
      const { data, error } = await supabase.functions.invoke('ai-deck-builder', {
        body: buildRequest
      });

      if (error) throw error;

      console.log('Build result:', data);
      setLastResult(data);
      
      // Apply built deck to the store
      if (data.decklist && data.decklist.length > 0) {
        importDeck(data.decklist);
        setFormat(buildRequest.format as any);
        setDeckName(`AI Built ${buildRequest.format} Deck`);
        
        toast({
          title: "Deck Built Successfully!",
          description: `Generated ${data.decklist.length} card deck with power level ${data.power.toFixed(1)}`,
        });
      } else {
        throw new Error('No cards generated');
      }
      
    } catch (error) {
      console.error('Build error:', error);
      toast({
        title: "Build Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsBuilding(false);
    }
  };

  const colorOptions = [
    { value: 'W', label: 'White', color: 'bg-yellow-100' },
    { value: 'U', label: 'Blue', color: 'bg-blue-100' },
    { value: 'B', label: 'Black', color: 'bg-gray-100' },
    { value: 'R', label: 'Red', color: 'bg-red-100' },
    { value: 'G', label: 'Green', color: 'bg-green-100' },
  ];

  const themeOptions = [
    { value: 'midrange', label: 'Midrange Value' },
    { value: 'aggro', label: 'Aggressive' },
    { value: 'control', label: 'Control' },
    { value: 'combo', label: 'Combo' },
    { value: 'tribal', label: 'Tribal' },
    { value: 'ramp', label: 'Ramp' },
  ];

  const toggleColor = (color: string) => {
    const colors = buildRequest.colors || [];
    const newColors = colors.includes(color) 
      ? colors.filter(c => c !== color)
      : [...colors, color];
    
    setBuildRequest(prev => ({ 
      ...prev, 
      colors: newColors,
      identity: newColors // For commander format
    }));
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-4">Deterministic AI Deck Builder</h3>
            <p className="text-sm text-muted-foreground">
              Build complete, legal, playable decks with explainable decisions
            </p>
          </div>

          {/* Format Selection */}
          <div className="space-y-2">
            <Label>Format</Label>
            <Select
              value={buildRequest.format}
              onValueChange={(value) => setBuildRequest(prev => ({ ...prev, format: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="commander">Commander (EDH)</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="modern">Modern</SelectItem>
                <SelectItem value="pioneer">Pioneer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Color Identity */}
          <div className="space-y-2">
            <Label>Color Identity</Label>
            <div className="flex space-x-2">
              {colorOptions.map(({ value, label, color }) => (
                <Button
                  key={value}
                  variant={buildRequest.colors?.includes(value) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleColor(value)}
                  className={buildRequest.colors?.includes(value) ? color : ''}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Theme Selection */}
          <div className="space-y-2">
            <Label>Archetype Theme</Label>
            <Select
              value={buildRequest.themeId}
              onValueChange={(value) => setBuildRequest(prev => ({ ...prev, themeId: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {themeOptions.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Power Target */}
          <div className="space-y-2">
            <Label>Power Level Target: {buildRequest.powerTarget}</Label>
            <Slider
              value={[buildRequest.powerTarget]}
              onValueChange={(value) => setBuildRequest(prev => ({ ...prev, powerTarget: value[0] }))}
              min={1}
              max={10}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Casual (1-3)</span>
              <span>Focused (4-6)</span>
              <span>High Power (7-9)</span>
              <span>cEDH (10)</span>
            </div>
          </div>

          {/* Budget */}
          <div className="space-y-2">
            <Label>Budget</Label>
            <Select
              value={buildRequest.budget}
              onValueChange={(value: any) => setBuildRequest(prev => ({ ...prev, budget: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low ($0-50)</SelectItem>
                <SelectItem value="med">Medium ($50-200)</SelectItem>
                <SelectItem value="high">High ($200+)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Build Button */}
          <Button 
            onClick={buildDeck} 
            disabled={isBuilding || (buildRequest.format === 'commander' && (!buildRequest.colors || buildRequest.colors.length === 0))}
            className="w-full"
            size="lg"
          >
            {isBuilding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Building Deck...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Build Deck
              </>
            )}
          </Button>

          {buildRequest.format === 'commander' && (!buildRequest.colors || buildRequest.colors.length === 0) && (
            <div className="flex items-center space-x-2 text-orange-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>Commander format requires at least one color</span>
            </div>
          )}
        </div>
      </Card>

      {/* Build Result */}
      {lastResult && (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">Build Result</h4>
              <Badge variant="outline">
                Power: {lastResult.power.toFixed(1)}/10
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Cards Generated:</span>
                <span className="ml-2">{lastResult.decklist.length}</span>
              </div>
              <div>
                <span className="font-medium">Changes Made:</span>
                <span className="ml-2">{lastResult.changelog.length}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="font-medium">Analysis</h5>
              <p className="text-sm text-muted-foreground">
                {lastResult.analysis}
              </p>
            </div>

            {/* Subscores */}
            <div className="space-y-2">
              <h5 className="font-medium">Component Scores</h5>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {Object.entries(lastResult.subscores).map(([category, score]) => (
                  <div key={category} className="flex justify-between">
                    <span className="capitalize">{category}:</span>
                    <span>{Math.round(score)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Changelog */}
            <div className="space-y-2">
              <h5 className="font-medium">Recent Changes</h5>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {lastResult.changelog.slice(-5).map((entry, index) => (
                  <div key={index} className="text-xs p-2 bg-muted rounded">
                    <span className="font-medium capitalize">{entry.action}</span>{' '}
                    <span>{entry.card}</span> - {entry.reason}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}