import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { useAuth } from '@/components/AuthProvider';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { returnPathFrom } from '@/lib/auth/returnPath';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();

  /**
   * Where to go once you are in.
   *
   * An online table link is sent to people who are not signed in, and landing
   * them on the dashboard throws the invitation away: the code was only ever in
   * that URL. So a caller may name where it wanted to be.
   */
  const next = returnPathFrom(search.get('next'));
  /**
   * Say why they are here.
   *
   * Somebody who typed `/login` chose to be on this page. Somebody who followed
   * a shared deck link did not, and without a line saying so the page reads as
   * the app having lost their link. `next` is the only thing that tells the two
   * apart.
   */
  const redirected = Boolean(search.get('next'));
  /* Whatever they were going to, they should still be going to it after making
     an account rather than after signing in. */
  const registerHref = redirected ? `/register?next=${encodeURIComponent(next)}` : '/register';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await signIn(email, password);

      if (error) {
        showError('Sign in failed', error.message);
      } else {
        showSuccess('Signed in', 'Welcome back to DeckMatrix.');
        navigate(next);
      }
    } catch {
      showError('Sign in failed', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      description={
        redirected
          ? 'That page needs an account. Sign in and we will take you straight there.'
          : 'Pick up where you left off with your collection and decks.'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          {/* "Forgot password?" used to sit in this label row, which put it
              BETWEEN the email field and the password field in the tab order:
              Email, Forgot password?, Password. Somebody tabbing through the
              form met the escape hatch before the field they were filling in.
              It reads the same underneath the input and it tabs in the order
              the form is actually filled. */}
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-12"
              placeholder="Enter your password"
            />
            {/* 44x44, not 16x16.

                It was the icon and nothing else, so the tap target was the
                size of the eye: 16 by 16, against a WCAG 2.2 minimum of 24 and
                a comfortable thumb of 44. It is also the one control that lets
                somebody check what they typed in bad light at a table, which
                is exactly when a small target fails. The box grows; the icon
                does not move, because the padding is symmetrical around it. */}
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="rounded-md py-1 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{' '}
          <Link
            to={registerHref}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
