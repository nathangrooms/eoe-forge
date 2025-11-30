import { PasswordResetFlow } from '@/components/auth/PasswordResetFlow';
import { UpdatePasswordForm } from '@/components/auth/UpdatePasswordForm';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function ResetPassword() {
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    // Check if this is a password update (user clicked link in email)
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      {isUpdating ? <UpdatePasswordForm /> : <PasswordResetFlow />}
    </div>
  );
}
