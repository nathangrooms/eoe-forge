import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { TwoFactorSetup } from '@/components/auth/TwoFactorSetup';
import { useSubscriptionLimits } from '@/hooks/useFeatureAccess';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { exportDeckToText } from '@/lib/deckExport';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULE_TEXT,
  validatePasswordPair,
} from '@/lib/validation/password';
import {
  Mail,
  Lock,
  ShieldCheck,
  CreditCard,
  LogOut,
  Check,
  Download,
  FileText,
  Sun,
  Moon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface UserSubscription {
  tier: 'free' | 'pro' | 'unlimited';
  is_active: boolean;
  started_at: string | null;
  expires_at: string | null;
}

/** Suffix shown after a plan limit, keyed by `subscription_limits.limit_type`. */
const LIMIT_PERIOD: Record<string, string> = {
  monthly: ' / month',
  daily: ' / day',
  total: '',
};

/**
 * Settings is a two-column board, not a centred ribbon.
 *
 * It used to render inside `mx-auto max-w-3xl`, which on a 1440px screen left
 * roughly 570px of empty background either side of a 768px column — the page
 * was 47% dead space. The left column carries the read-mostly cards (identity,
 * theme, plan); the right carries the two that expand into forms, so it gets
 * the extra width. `items-start` keeps each column packing to its own height
 * instead of stretching to match the taller one.
 */
const COLUMNS =
  'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-start';

/** Triggers a client-side file download for text the page just built. */
function downloadFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Settings() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);

  const { data: allLimits, isLoading: limitsLoading } = useSubscriptionLimits();

  // Edit states
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [twoFactorOpen, setTwoFactorOpen] = useState(false);

  const [exporting, setExporting] = useState<'json' | 'text' | null>(null);

  useEffect(() => {
    if (user) {
      loadUserData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadUserData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData);
        setNewUsername(profileData.username || '');
      }

      const { data: subData } = await supabase
        .from('user_subscriptions')
        .select('tier, is_active, started_at, expires_at')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      setSubscription(
        subData || { tier: 'free', is_active: true, started_at: null, expires_at: null }
      );
    } catch (error) {
      console.error('Error loading user data:', error);
      showError('Could not load your account', 'Refresh the page to try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUsername = async () => {
    if (!user || !newUsername.trim()) return;

    try {
      setSavingUsername(true);

      const { error } = await supabase
        .from('profiles')
        .update({ username: newUsername.trim() })
        .eq('id', user.id);

      if (error) throw error;

      setProfile(prev => (prev ? { ...prev, username: newUsername.trim() } : prev));
      setEditingUsername(false);
      showSuccess('Updated', 'Username updated successfully');
    } catch (error) {
      console.error('Error updating username:', error);
      showError('Failed to update username');
    } finally {
      setSavingUsername(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;

    if (!currentPassword) {
      showError('Current password required', 'Enter your current password to confirm the change.');
      return;
    }

    const check = validatePasswordPair(newPassword, confirmPassword);
    if (!check.valid) {
      showError('Check your password', check.message);
      return;
    }

    try {
      setSavingPassword(true);

      // Re-authenticate before changing the credential. Without this, anyone
      // with access to an open session could silently take over the account.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (reauthError) {
        showError('Current password is incorrect');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) throw error;

      setChangePasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showSuccess('Updated', 'Password changed successfully');
    } catch (error: any) {
      console.error('Error changing password:', error);
      showError(error.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      showError('Please enter a valid email');
      return;
    }

    try {
      setSavingEmail(true);

      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });

      if (error) throw error;

      setChangeEmailOpen(false);
      setNewEmail('');
      showSuccess('Verification sent', 'Check your new email to confirm the change');
    } catch (error: any) {
      console.error('Error changing email:', error);
      showError(error.message || 'Failed to change email');
    } finally {
      setSavingEmail(false);
    }
  };

  /** Reads every row this user owns across the four data tables. */
  const loadUserExport = async () => {
    if (!user) throw new Error('Not signed in');

    const [collections, decks, wishlist] = await Promise.all([
      supabase.from('user_collections').select('*').eq('user_id', user.id),
      supabase.from('user_decks').select('*').eq('user_id', user.id),
      supabase.from('wishlist').select('*').eq('user_id', user.id),
    ]);

    if (collections.error) throw collections.error;
    if (decks.error) throw decks.error;
    if (wishlist.error) throw wishlist.error;

    const deckIds = (decks.data || []).map(d => d.id);
    let deckCards: any[] = [];

    if (deckIds.length > 0) {
      const { data, error } = await supabase
        .from('deck_cards')
        .select('*')
        .in('deck_id', deckIds);
      if (error) throw error;
      deckCards = data || [];
    }

    return {
      collections: collections.data || [],
      decks: decks.data || [],
      deckCards,
      wishlist: wishlist.data || [],
    };
  };

  const handleExportJson = async () => {
    try {
      setExporting('json');
      const data = await loadUserExport();
      const stamp = new Date().toISOString().split('T')[0];

      downloadFile(
        `deckmatrix-export-${stamp}.json`,
        JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            user_id: user?.id,
            ...data,
          },
          null,
          2
        ),
        'application/json'
      );

      showSuccess(
        'Export downloaded',
        `${data.collections.length} collection rows, ${data.decks.length} decks, ${data.wishlist.length} wishlist rows`
      );
    } catch (error: any) {
      console.error('Export failed:', error);
      showError('Export failed', error.message || 'Could not read your data');
    } finally {
      setExporting(null);
    }
  };

  const handleExportDecklists = async () => {
    try {
      setExporting('text');
      const { decks, deckCards } = await loadUserExport();

      if (decks.length === 0) {
        showError('Nothing to export', 'You do not have any decks yet.');
        return;
      }

      const body = decks
        .map(deck => {
          const cards = deckCards.filter(c => c.deck_id === deck.id);
          return `// ${deck.name}${deck.format ? ` (${deck.format})` : ''}\n${exportDeckToText(cards)}`;
        })
        .join('\n\n');

      const stamp = new Date().toISOString().split('T')[0];
      downloadFile(`deckmatrix-decklists-${stamp}.txt`, body, 'text/plain');

      showSuccess('Decklists downloaded', `${decks.length} deck${decks.length === 1 ? '' : 's'} exported`);
    } catch (error: any) {
      console.error('Decklist export failed:', error);
      showError('Export failed', error.message || 'Could not read your decks');
    } finally {
      setExporting(null);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      showError('Sign out failed', 'Please try again.');
    }
  };

  const getInitials = (name: string | null | undefined, email: string | undefined) => {
    if (name) return name.slice(0, 2).toUpperCase();
    if (email) return email.slice(0, 2).toUpperCase();
    return 'U';
  };

  const tier = subscription?.tier || 'free';
  const tierLimits = (allLimits || []).filter(limit => limit.tier === tier);

  if (loading) {
    return (
      <StandardPageLayout
        title="Account settings"
        description="Manage your profile, appearance, security and data."
      >
        <div className={COLUMNS}>
          <div className="space-y-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-16 w-16 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-4 p-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-4 p-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-2/3" />
              </CardContent>
            </Card>
          </div>
        </div>
      </StandardPageLayout>
    );
  }

  return (
    <StandardPageLayout
      title="Account settings"
      description="Manage your profile, appearance, security and data."
    >
      {/* Two real columns rather than one 768px ribbon stranded in the middle of
          a 1440px screen. Identity and security — the tall, form-bearing cards —
          run down the wide column; the reference cards sit beside them. Below
          `lg` this collapses to a single stack in the same reading order. */}
      <div className={COLUMNS}>
        <div className="space-y-4">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>How you appear across DeckMatrix</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-muted text-base text-muted-foreground">
                  {getInitials(profile?.username, user?.email)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                {editingUsername ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Enter username"
                      className="max-w-[220px]"
                    />
                    <Button size="sm" onClick={handleUpdateUsername} disabled={savingUsername}>
                      <Check className="h-4 w-4" />
                      <span className="sr-only">Save username</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNewUsername(profile?.username || '');
                        setEditingUsername(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-medium text-foreground">
                      {profile?.username || 'No username set'}
                    </h2>
                    <Button size="sm" variant="ghost" onClick={() => setEditingUsername(true)}>
                      Edit
                    </Button>
                  </div>
                )}
                <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
                {profile?.created_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Member since {new Date(profile.created_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
            <CardDescription>DeckMatrix ships dark by default</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Theme</p>
                <p className="text-sm text-muted-foreground">
                  Applies immediately and is remembered on this device.
                </p>
              </div>
              <div
                role="radiogroup"
                aria-label="Theme"
                className="flex shrink-0 items-center gap-1 rounded-lg bg-muted/50 p-1"
              >
                {([
                  { value: 'light', label: 'Light', icon: Sun },
                  { value: 'dark', label: 'Dark', icon: Moon },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={theme === value}
                    onClick={() => setTheme(value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                      theme === value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" />
              Plan
            </CardTitle>
            <CardDescription>Your current plan and what it allows</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize text-foreground">{tier}</span>
                  <Badge variant="secondary">Active</Badge>
                </div>
                {subscription?.expires_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Renews {new Date(subscription.expires_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            {limitsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : tierLimits.length > 0 ? (
              <dl className="[&>*:nth-child(even)]:bg-muted/30 [&>*]:rounded [&>*]:px-2">
                {tierLimits.map(limit => (
                  <div key={limit.id} className="flex items-center justify-between gap-4 py-2">
                    <dt className="text-sm text-foreground">
                      {limit.description || limit.feature_key.replace(/_/g, ' ')}
                    </dt>
                    <dd className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {limit.limit_value < 0 ? 'Unlimited' : limit.limit_value}
                      {LIMIT_PERIOD[limit.limit_type] ?? ''}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                No limits are configured for this plan.
              </p>
            )}
          </CardContent>
        </Card>

        </div>

        <div className="space-y-4">
        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4" />
              Security
            </CardTitle>
            <CardDescription>Sign-in credentials and account protection</CardDescription>
          </CardHeader>
          {/* Settings is a list of rows, so the row you tapped is where the
              form belongs. Each one expands in place — nothing dims, nothing
              covers the rows around it. */}
          <CardContent className="[&>*:nth-child(even)]:bg-muted/25 [&>*]:rounded-lg [&>*]:px-3">
            <div className="py-3 first:pt-0">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Email address</p>
                    <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-expanded={changeEmailOpen}
                  onClick={() => setChangeEmailOpen(!changeEmailOpen)}
                >
                  {changeEmailOpen ? 'Close' : 'Change'}
                </Button>
              </div>

              {changeEmailOpen && (
                <div
                  className="mt-3 space-y-4 rounded-lg bg-muted/30 p-4"
                  onKeyDown={(e) => { if (e.key === 'Escape') setChangeEmailOpen(false); }}
                >
                  <p className="text-sm text-muted-foreground">
                    A verification link will be sent to your new address. The change takes effect
                    once you follow it.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="settings-new-email">New email</Label>
                    <Input
                      id="settings-new-email"
                      type="email"
                      autoComplete="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={handleChangeEmail} disabled={savingEmail}>
                      {savingEmail ? 'Sending…' : 'Send verification'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setChangeEmailOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Password</p>
                    <p className="text-sm text-muted-foreground">{PASSWORD_RULE_TEXT}</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-expanded={changePasswordOpen}
                  onClick={() => setChangePasswordOpen(!changePasswordOpen)}
                >
                  {changePasswordOpen ? 'Close' : 'Change'}
                </Button>
              </div>

              {changePasswordOpen && (
                <div
                  className="mt-3 space-y-4 rounded-lg bg-muted/30 p-4"
                  onKeyDown={(e) => { if (e.key === 'Escape') setChangePasswordOpen(false); }}
                >
                  <p className="text-sm text-muted-foreground">
                    Confirm your current password, then choose a new one.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="settings-current-password">Current password</Label>
                    <Input
                      id="settings-current-password"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-new-password">New password</Label>
                    <Input
                      id="settings-new-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={PASSWORD_MIN_LENGTH}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                    />
                    <p className="text-xs text-muted-foreground">{PASSWORD_RULE_TEXT}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-confirm-password">Confirm new password</Label>
                    <Input
                      id="settings-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={PASSWORD_MIN_LENGTH}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={handleChangePassword} disabled={savingPassword}>
                      {savingPassword ? 'Saving…' : 'Update password'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setChangePasswordOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="py-3 last:pb-0">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Two-factor authentication</p>
                    <p className="text-sm text-muted-foreground">
                      Require a code from an authenticator app at sign-in.
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-expanded={twoFactorOpen}
                  onClick={() => setTwoFactorOpen(!twoFactorOpen)}
                >
                  {twoFactorOpen ? 'Close' : 'Manage'}
                </Button>
              </div>

              {twoFactorOpen && (
                <div className="mt-3 space-y-4 rounded-lg bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">
                    Use an authenticator app such as 1Password, Authy or Google Authenticator.
                  </p>
                  <TwoFactorSetup />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Data & account */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data &amp; account</CardTitle>
            <CardDescription>Take your data with you at any time</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Full export (JSON)</p>
                <p className="text-sm text-muted-foreground">
                  Collection, decks, deck cards and wishlist.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJson}
                disabled={exporting !== null}
              >
                <Download className="mr-2 h-4 w-4" />
                {exporting === 'json' ? 'Preparing…' : 'Download'}
              </Button>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Decklists (.txt)</p>
                <p className="text-sm text-muted-foreground">
                  Plain decklists that import into Moxfield, Archidekt and Arena.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportDecklists}
                disabled={exporting !== null}
              >
                <FileText className="mr-2 h-4 w-4" />
                {exporting === 'text' ? 'Preparing…' : 'Download'}
              </Button>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Sign out</p>
                <p className="text-sm text-muted-foreground">End this session on this device.</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </StandardPageLayout>
  );
}
