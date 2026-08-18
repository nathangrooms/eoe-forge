import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE_TEXT, validatePasswordPair } from '@/lib/validation/password';

/**
 * Renders the set-a-new-password form only; AuthLayout supplies the heading.
 * The password rule comes from the shared policy so it cannot drift from
 * Register and Settings.
 */
export function UpdatePasswordForm() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const check = validatePasswordPair(password, confirmPassword);
    if (!check.valid) {
      showError('Check your password', check.message);
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      showSuccess('Password updated', 'You are signed in with your new password.');
      navigate('/dashboard');
    } catch (error: any) {
      showError('Update failed', error.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleUpdatePassword} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          placeholder="Enter new password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
          minLength={PASSWORD_MIN_LENGTH}
        />
        <p className="text-xs text-muted-foreground">{PASSWORD_RULE_TEXT}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-new-password">Confirm password</Label>
        <Input
          id="confirm-new-password"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={loading}
          minLength={PASSWORD_MIN_LENGTH}
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  );
}
