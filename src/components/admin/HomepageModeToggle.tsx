import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Globe, AlertTriangle } from 'lucide-react';

export function HomepageModeToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchFlag();
  }, []);

  const fetchFlag = async () => {
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('enabled')
        .eq('key', 'show_testing_banner')
        .maybeSingle();
      
      if (error) throw error;
      setEnabled(data?.enabled ?? false);
    } catch (e) {
      console.error('Failed to fetch homepage mode:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (newValue: boolean) => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('feature_flags')
        .update({ enabled: newValue, updated_at: new Date().toISOString() })
        .eq('key', 'show_testing_banner');
      
      if (error) throw error;
      
      setEnabled(newValue);
      toast.success(newValue ? 'Testing banner enabled' : 'Full homepage restored');
    } catch (e) {
      console.error('Failed to update homepage mode:', e);
      toast.error('Failed to update homepage mode');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Homepage Mode
        </CardTitle>
        <CardDescription>
          Control what visitors see on the public homepage
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="testing-banner" className="font-medium">
              Show Testing Banner
            </Label>
            <p className="text-sm text-muted-foreground">
              When enabled, shows a simple "Open for Testing" banner instead of the full homepage
            </p>
          </div>
          <Switch
            id="testing-banner"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={updating}
          />
        </div>
        
        {/* Surface tint, no hue and no border: this is an app-state warning,
            not a Magic colour, and hairline borders are banned. */}
        {enabled && (
          <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
            <p className="text-sm text-muted-foreground">
              The full homepage is currently hidden. Visitors will only see the testing banner.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
