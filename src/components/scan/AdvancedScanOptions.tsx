import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Camera, ScanLine, Settings, Zap } from 'lucide-react';

interface AdvancedScanOptionsProps {
  onOptionsChange: (options: ScanOptions) => void;
}

interface ScanOptions {
  autoCapture: boolean;
  captureDelay: number;
  quality: 'fast' | 'balanced' | 'accurate';
  batchMode: boolean;
  autoAddToCollection: boolean;
  defaultCondition: string;
  skipDuplicates: boolean;
}

export function AdvancedScanOptions({ onOptionsChange }: AdvancedScanOptionsProps) {
  const [options, setOptions] = useState<ScanOptions>({
    autoCapture: true,
    captureDelay: 1500,
    quality: 'balanced',
    batchMode: false,
    autoAddToCollection: true,
    defaultCondition: 'NM',
    skipDuplicates: false,
  });

  const updateOption = <K extends keyof ScanOptions>(key: K, value: ScanOptions[K]) => {
    const newOptions = { ...options, [key]: value };
    setOptions(newOptions);
    onOptionsChange(newOptions);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          Scan Options
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Auto Capture */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Auto-Capture</Label>
            <div className="text-xs text-muted-foreground">
              Automatically capture when card is detected
            </div>
          </div>
          <Switch
            checked={options.autoCapture}
            onCheckedChange={(checked) => updateOption('autoCapture', checked)}
          />
        </div>

        {/* Capture Delay */}
        {options.autoCapture && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Capture Delay</Label>
              <span className="text-sm text-muted-foreground">{options.captureDelay}ms</span>
            </div>
            <Slider
              value={[options.captureDelay]}
              onValueChange={([value]) => updateOption('captureDelay', value)}
              min={500}
              max={3000}
              step={100}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Fast (500ms)</span>
              <span>Slow (3000ms)</span>
            </div>
          </div>
        )}

        {/* Quality */}
        <div className="space-y-2">
          <Label>Recognition Quality</Label>
          <Select
            value={options.quality}
            onValueChange={(value: any) => updateOption('quality', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fast">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  <span>Fast - Quick but less accurate</span>
                </div>
              </SelectItem>
              <SelectItem value="balanced">
                <div className="flex items-center gap-2">
                  <ScanLine className="h-4 w-4" />
                  <span>Balanced - Good speed and accuracy</span>
                </div>
              </SelectItem>
              <SelectItem value="accurate">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  <span>Accurate - Slower but most reliable</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Batch Mode */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Batch Mode</Label>
            <div className="text-xs text-muted-foreground">
              Scan multiple cards in sequence
            </div>
          </div>
          <Switch
            checked={options.batchMode}
            onCheckedChange={(checked) => updateOption('batchMode', checked)}
          />
        </div>

        {/* Auto Add to Collection */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Auto-Add to Collection</Label>
            <div className="text-xs text-muted-foreground">
              Automatically add scanned cards
            </div>
          </div>
          <Switch
            checked={options.autoAddToCollection}
            onCheckedChange={(checked) => updateOption('autoAddToCollection', checked)}
          />
        </div>

        {/* Default Condition */}
        <div className="space-y-2">
          <Label>Default Condition</Label>
          <Select
            value={options.defaultCondition}
            onValueChange={(value) => updateOption('defaultCondition', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M">Mint (M)</SelectItem>
              <SelectItem value="NM">Near Mint (NM)</SelectItem>
              <SelectItem value="LP">Lightly Played (LP)</SelectItem>
              <SelectItem value="MP">Moderately Played (MP)</SelectItem>
              <SelectItem value="HP">Heavily Played (HP)</SelectItem>
              <SelectItem value="D">Damaged (D)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Skip Duplicates */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Skip Duplicates</Label>
            <div className="text-xs text-muted-foreground">
              Don't add cards already in collection
            </div>
          </div>
          <Switch
            checked={options.skipDuplicates}
            onCheckedChange={(checked) => updateOption('skipDuplicates', checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
