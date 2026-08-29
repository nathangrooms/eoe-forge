import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { useAuth } from '@/components/AuthProvider';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { PASSWORD_RULE_TEXT, validatePasswordPair } from '@/lib/validation/password';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { returnPathFrom } from '@/lib/auth/returnPath';

export default function Register() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();

  /**
   * The other half of the shared-link path.
   *
   * `/login?next=` sends people here with the destination still attached, so
   * somebody who follows a shared deck link, has no account and makes one lands
   * on the deck rather than on the dashboard wondering what the link was.
   */
  const next = returnPathFrom(search.get('next'));
  const redirected = Boolean(search.get('next'));
  const loginHref = redirected ? `/login?next=${encodeURIComponent(next)}` : '/login';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const check = validatePasswordPair(formData.password, formData.confirmPassword);
    if (!check.valid) {
      showError('Check your password', check.message);
      return;
    }

    setLoading(true);

    try {
      const { error } = await signUp(formData.email, formData.password, formData.username);

      if (error) {
        if (error.message?.includes('already registered')) {
          showError('Account exists', 'This email is already registered. Sign in instead.');
        } else {
          showError('Sign up failed', error.message);
        }
      } else {
        showSuccess('Account created', 'Welcome to DeckMatrix.');
        navigate(next);
      }
    } catch {
      showError('Sign up failed', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      description="Catalogue your collection and build decks against what you already own."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={formData.username}
            onChange={handleChange}
            required
            placeholder="Choose a username"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={handleChange}
            required
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={formData.password}
              onChange={handleChange}
              required
              className="pr-10"
              placeholder="Create a password"
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
          <p className="text-xs text-muted-foreground">{PASSWORD_RULE_TEXT}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              className="pr-10"
              placeholder="Re-enter your password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account…
            </>
          ) : (
            'Create account'
          )}
        </Button>

        {/* The /terms and /privacy routes do not exist — App.tsx's public
            catch-all redirects both to the homepage — so this is deliberately
            not linked rather than being two dead links. */}
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          By creating an account you agree to the DeckMatrix Terms of Service and Privacy Policy.
        </p>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            to={loginHref}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
