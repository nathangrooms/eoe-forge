import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Chrome, Github } from 'lucide-react';

export function OAuthProviders() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setLoading(provider);
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) throw error;
      
      toast.success(`Redirecting to ${provider} login...`);
    } catch (error: any) {
      toast.error(`${provider} sign-in failed: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Social Login</CardTitle>
        <CardDescription>
          Sign in quickly with your existing account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => handleOAuthSignIn('google')}
          disabled={loading !== null}
        >
          <Chrome className="h-4 w-4 mr-2" />
          {loading === 'google' ? 'Connecting...' : 'Continue with Google'}
        </Button>
        
        <Button
          variant="outline"
          className="w-full"
          onClick={() => handleOAuthSignIn('github')}
          disabled={loading !== null}
        >
          <Github className="h-4 w-4 mr-2" />
          {loading === 'github' ? 'Connecting...' : 'Continue with GitHub'}
        </Button>
        
        <p className="text-xs text-center text-muted-foreground pt-2">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </CardContent>
    </Card>
  );
}
