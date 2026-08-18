import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { ShieldCheck, Loader2 } from 'lucide-react';

/**
 * TOTP enrolment against `supabase.auth.mfa`.
 *
 * Renders bare content — Settings supplies the dialog chrome. The previous
 * version never called `listFactors`, so it always claimed 2FA was off and a
 * second enrolment attempt would collide with the existing factor.
 */
export function TwoFactorSetup() {
  const [checking, setChecking] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const [enabledFactorId, setEnabledFactorId] = useState<string | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadFactors = async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        if (cancelled) return;

        const verified = data?.totp?.[0];
        setEnabledFactorId(verified?.id ?? null);
      } catch (error: any) {
        if (!cancelled) {
          showError('Could not read 2FA status', error.message || 'Please try again.');
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    loadFactors();
    return () => {
      cancelled = true;
    };
  }, []);

  const startEnrollment = async () => {
    setEnrolling(true);

    try {
      // Clear out any half-finished factor from a previous attempt, otherwise
      // Supabase rejects the new enrolment as a duplicate friendly name.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const stale = (existing?.all || []).filter(
        f => f.factor_type === 'totp' && f.status !== 'verified'
      );
      for (const factor of stale) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;

      setPendingFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (error: any) {
      showError('Could not start 2FA setup', error.message || 'Please try again.');
    } finally {
      setEnrolling(false);
    }
  };

  const cancelEnrollment = async () => {
    if (pendingFactorId) {
      await supabase.auth.mfa.unenroll({ factorId: pendingFactorId });
    }
    setPendingFactorId(null);
    setQrCode(null);
    setSecret(null);
    setVerificationCode('');
  };

  const verifyAndEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingFactorId) return;

    setVerifying(true);

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: pendingFactorId,
        code: verificationCode,
      });

      if (error) throw error;

      setEnabledFactorId(pendingFactorId);
      setPendingFactorId(null);
      setQrCode(null);
      setSecret(null);
      setVerificationCode('');
      showSuccess('Two-factor enabled', 'You will be asked for a code at next sign-in.');
    } catch (error: any) {
      showError('Verification failed', error.message || 'That code was not accepted.');
    } finally {
      setVerifying(false);
    }
  };

  const disable2FA = async () => {
    if (!enabledFactorId) return;
    setDisabling(true);

    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: enabledFactorId });
      if (error) throw error;

      setEnabledFactorId(null);
      showSuccess('Two-factor disabled');
    } catch (error: any) {
      showError('Could not disable 2FA', error.message || 'Please try again.');
    } finally {
      setDisabling(false);
    }
  };

  if (checking) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (enabledFactorId) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-muted p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Two-factor is on</p>
            <p className="text-sm text-muted-foreground">
              Your authenticator app is required at sign-in.
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={disable2FA} disabled={disabling}>
          {disabling ? 'Removing…' : 'Turn off two-factor'}
        </Button>
      </div>
    );
  }

  if (qrCode) {
    return (
      <form onSubmit={verifyAndEnable} className="space-y-4">
        <div className="flex justify-center rounded-lg bg-card p-4 shadow-md shadow-black/20">
          {/* The QR is an SVG data URI from Supabase; it needs a light ground
              to stay scannable in dark mode, hence the explicit white here. */}
          <img
            src={qrCode}
            alt="Two-factor QR code"
            className="h-44 w-44 rounded bg-white p-2"
          />
        </div>

        {secret && (
          <p className="text-center text-xs text-muted-foreground">
            Can't scan? Enter this key manually:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
              {secret}
            </code>
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="mfa-code">Six-digit code</Label>
          <Input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
            maxLength={6}
            required
            disabled={verifying}
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={verifying || verificationCode.length !== 6}>
            {verifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying…
              </>
            ) : (
              'Verify and enable'
            )}
          </Button>
          <Button type="button" variant="ghost" onClick={cancelEnrollment} disabled={verifying}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Two-factor authentication asks for a code from your authenticator app in addition to your
        password whenever you sign in.
      </p>
      <Button onClick={startEnrollment} disabled={enrolling}>
        {enrolling ? 'Setting up…' : 'Set up two-factor'}
      </Button>
    </div>
  );
}
