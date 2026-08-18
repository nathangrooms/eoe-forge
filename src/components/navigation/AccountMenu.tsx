import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { LogOut, Moon, Settings, Shield, Sun } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** "nathan@example.com" -> "NA"; a username wins over the address if present. */
export function accountInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const cleaned = name.split('@')[0].replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  if (!cleaned) return name.slice(0, 2).toUpperCase();
  const parts = cleaned.split(/\s+/);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

export function useDisplayName(): { name: string; email: string } {
  const { user } = useAuth();
  const email = user?.email ?? '';
  const metaName =
    (user?.user_metadata?.username as string | undefined) ??
    (user?.user_metadata?.full_name as string | undefined);
  return { name: metaName || email.split('@')[0] || 'Account', email };
}

/**
 * The account menu is the only place in the desktop shell that can sign out or
 * switch theme. Before this existed, `signOut` was destructured in the header
 * and never called, and the only theme control in the codebase lived in a file
 * that was never imported.
 */
export function AccountMenu() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const { name, email } = useDisplayName();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted ? resolvedTheme === 'dark' : true;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  if (!user) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 w-9 items-center justify-center rounded-full ring-offset-background transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Account menu"
      >
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
            {accountInitials(name || email)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-foreground">{name}</span>
          {email && (
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>

        {isAdmin && (
          <DropdownMenuItem onSelect={() => navigate('/admin')}>
            <Shield className="mr-2 h-4 w-4" />
            Admin
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          onSelect={event => {
            // Keep the menu open so the theme change is visible in place.
            event.preventDefault();
            setTheme(isDark ? 'light' : 'dark');
          }}
        >
          {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          {isDark ? 'Light theme' : 'Dark theme'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={handleSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Avatar + name block, used at the foot of the mobile sheet. */
export function AccountIdentity({ className }: { className?: string }) {
  const { name, email } = useDisplayName();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
            {accountInitials(name || email)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
        </div>
      </div>
    </div>
  );
}
