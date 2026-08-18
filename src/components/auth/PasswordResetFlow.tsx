import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { sanitizeEmail } from '@/lib/security/inputSanitization';
import { Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Renders the request-a-reset-link form only — the page chrome (heading,
 * description, artwork) comes from AuthLayout, so this no longer wraps itself
 * in a Card with a second, competing title.
 */
export function PasswordResetFlow() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail || !sanitizedEmail.includes('@')) {
      showError('Invalid email', 'Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(sanitizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setSent(true);
      showSuccess('Reset email sent', 'Check your inbox for the password reset link');
    } catch (error: any) {
      showError('Reset failed', error.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-4">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Check your email</p>
            <p className="text-sm text-muted-foreground">
              We sent a reset link to <span className="text-foreground">{email}</span>. The link
              expires in one hour.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setSent(false)}
        >
          Use a different email
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          <Link
            to="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleResetRequest} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Sending…' : 'Send reset link'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link
          to="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
