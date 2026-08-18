import { useEffect, useState } from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { PasswordResetFlow } from '@/components/auth/PasswordResetFlow';
import { UpdatePasswordForm } from '@/components/auth/UpdatePasswordForm';
import { supabase } from '@/integrations/supabase/client';

/**
 * Serves both `/forgot-password` (request a reset link) and `/reset-password`
 * (set a new password after following the emailed link). Both now sit inside
 * the same AuthLayout as Login and Register — previously this page rendered a
 * bare centred Card and looked like a different product.
 */
export default function ResetPassword() {
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY once the emailed link is consumed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsUpdating(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthLayout
      title={isUpdating ? 'Set a new password' : 'Reset your password'}
      description={
        isUpdating
          ? 'Choose a password you do not use anywhere else.'
          : 'Enter your email address and we will send you a link to set a new password.'
      }
    >
      {isUpdating ? <UpdatePasswordForm /> : <PasswordResetFlow />}
    </AuthLayout>
  );
}
