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
      description="Pick up where you left off with your collection and decks."
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
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
            to="/register"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
