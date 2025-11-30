import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Shield, Key, CheckCircle } from 'lucide-react';

export function TwoFactorSetup() {
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);

  const startEnrollment = async () => {
    setEnrolling(true);
    
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
      });

      if (error) throw error;

      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      toast.success('Scan the QR code with your authenticator app');
    } catch (error: any) {
      toast.error('Failed to start 2FA setup: ' + error.message);
    } finally {
      setEnrolling(false);
    }
  };

  const verifyAndEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!factorId) {
      toast.error('Please start enrollment first');
      return;
    }

    setVerifying(true);

    try {
      const { data, error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: verificationCode,
      });

      if (error) throw error;

      setIsEnabled(true);
      setQrCode(null);
      setVerificationCode('');
      toast.success('Two-factor authentication enabled successfully!');
    } catch (error: any) {
      toast.error('Verification failed: ' + error.message);
    } finally {
      setVerifying(false);
    }
  };

  const disable2FA = async () => {
    if (!factorId) return;

    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId,
      });

      if (error) throw error;

      setIsEnabled(false);
      setFactorId(null);
      toast.success('Two-factor authentication disabled');
    } catch (error: any) {
      toast.error('Failed to disable 2FA: ' + error.message);
    }
  };

  if (isEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            2FA Enabled
          </CardTitle>
          <CardDescription>
            Your account is protected with two-factor authentication
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={disable2FA}>
            Disable 2FA
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (qrCode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Verify Setup
          </CardTitle>
          <CardDescription>
            Scan the QR code and enter the verification code
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center p-4 bg-background border rounded-lg">
            <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
          </div>
          
          <form onSubmit={verifyAndEnable} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Verification Code</Label>
              <Input
                id="code"
                type="text"
                placeholder="Enter 6-digit code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                maxLength={6}
                required
                disabled={verifying}
              />
            </div>

            <Button type="submit" disabled={verifying} className="w-full">
              {verifying ? 'Verifying...' : 'Verify and Enable'}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Add an extra layer of security to your account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Two-factor authentication (2FA) requires you to enter a code from your authenticator app 
          in addition to your password when signing in.
        </p>
        
        <Button onClick={startEnrollment} disabled={enrolling} className="w-full">
          {enrolling ? 'Setting up...' : 'Enable 2FA'}
        </Button>
      </CardContent>
    </Card>
  );
}
