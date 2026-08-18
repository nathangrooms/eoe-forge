import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { UserDetails } from '@/components/admin/UserDetails';
import { supabase } from '@/integrations/supabase/client';

/** /admin/users/:userId — one user's record, linkable between admins. */
export default function AdminUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setUsername(data?.username ?? null);
      });

    return () => { cancelled = true; };
  }, [userId]);

  return (
    <StandardPageLayout
      title={username || 'User'}
      description="Account activity and totals"
      action={
        <Button variant="ghost" onClick={() => navigate('/admin')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Admin
        </Button>
      }
    >
      <div className="max-w-3xl rounded-lg bg-card p-4 shadow-sm md:p-6">
        {userId ? (
          <UserDetails userId={userId} />
        ) : (
          <p className="text-sm text-muted-foreground">No user selected.</p>
        )}
      </div>
    </StandardPageLayout>
  );
}
