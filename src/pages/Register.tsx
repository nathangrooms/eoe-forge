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
import { useRef } from 'react';

/**
 * WHY THIS FORM CARRIES ITS OWN ERRORS AND NOT ONLY A TOAST.
 *
 * Measured on a keyboard and screen reader walk: submitting a bad password put
 * the reason in a toast, the toast was gone from every live region by 3,500 ms,
 * every field reported `aria-invalid: null` and `aria-describedby: null`, and
 * focus never moved off "Create account". So somebody who could not read the
 * screen was told nothing they could still find a second later, and nothing
 * pointed at the field that was wrong. That is the one fault on this walk that
 * could strand a real sign-up.
 *
 * The toast stays, because a sighted person half way down a form does look at
 * it. What is added is a message that STAYS on screen, is tied to its field by
 * `aria-describedby`, marks the field `aria-invalid`, and moves focus there.
 */
type FieldName = 'username' | 'email' | 'password' | 'confirmPassword';

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
  const [fieldError, setFieldError] = useState<{ field: FieldName; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLInputElement | null>>>({});

  const failField = (field: FieldName, title: string, message: string) => {
    setFieldError({ field, message });
    setFormError(null);
    showError(title, message);
    /* The message is useless if you cannot get to the box it is about. */
    window.requestAnimationFrame(() => fieldRefs.current[field]?.focus());
  };

  const errorFor = (field: FieldName) =>
    fieldError?.field === field ? fieldError.message : null;

  const describedBy = (field: FieldName, ...extra: string[]) => {
    const ids = [...extra];
    if (errorFor(field)) ids.push(`${field}-error`);
    return ids.length ? ids.join(' ') : undefined;
  };
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
    /* Typing into the field that was wrong clears the complaint about it. A
       message that stays after it has been answered is its own annoyance. */
    if (fieldError?.field === e.target.name) setFieldError(null);
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setFieldError(null);
    setFormError(null);

    const check = validatePasswordPair(formData.password, formData.confirmPassword);
    if (!check.valid) {
      const field: FieldName =
        check.message === 'Passwords do not match.' ? 'confirmPassword' : 'password';
      failField(field, 'Check your password', check.message ?? 'Check your password.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await signUp(formData.email, formData.password, formData.username);

      if (error) {
        if (error.message?.includes('already registered')) {
          failField(
            'email',
            'Account exists',
            'This email is already registered. Sign in instead.'
          );
        } else {
          setFormError(error.message || 'Something went wrong. Please try again.');
          showError('Sign up failed', error.message);
        }
      } else {
        showSuccess('Account created', 'Welcome to DeckMatrix.');
        navigate(next);
      }
    } catch {
      setFormError('Something went wrong. Please try again.');
      showError('Sign up failed', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * One error line, tied to its field and left on screen until it is answered.
   *
   * DELIBERATELY NOT `role="alert"`. Measured: with the alert role a screen
   * reader heard "Passwords do not match" from this line AND "Check your
   * password. Passwords do not match" from the toast's announcer, one after the
   * other, for a single failure.
   *
   * The toast announces. This line is reached the other way: `failField` moves
   * focus to the field, and the field carries `aria-invalid` plus an
   * `aria-describedby` pointing here, so arriving on the box announces its
   * label, that it is invalid, and this sentence as its description. That is
   * the standard pattern and it says everything once.
   */
  const FieldError = ({ field }: { field: FieldName }) => {
    const message = errorFor(field);
    if (!message) return null;
    return (
      <p id={`${field}-error`} className="text-sm text-foreground">
        {message}
      </p>
    );
  };

  return (
    <AuthLayout
      title="Create your account"
      description="Catalogue your collection and build decks against what you already own."
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Not `role="alert"` either, for the same reason: the toast announces
            it. This is the copy that STAYS after the toast has gone. */}
        {formError && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground">{formError}</p>
        )}

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
            ref={el => { fieldRefs.current.username = el; }}
            aria-invalid={errorFor('username') ? true : undefined}
            aria-describedby={describedBy('username')}
          />
          <FieldError field="username" />
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
            ref={el => { fieldRefs.current.email = el; }}
            aria-invalid={errorFor('email') ? true : undefined}
            aria-describedby={describedBy('email')}
          />
          <FieldError field="email" />
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
              className="pr-12"
              placeholder="Create a password"
              ref={el => { fieldRefs.current.password = el; }}
              aria-invalid={errorFor('password') ? true : undefined}
              /* "At least 8 characters." was on screen and connected to
                 nothing, so a reader never heard the rule it was about to
                 break. */
              aria-describedby={describedBy('password', 'password-rule')}
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
          <p id="password-rule" className="text-xs text-muted-foreground">
            {PASSWORD_RULE_TEXT}
          </p>
          <FieldError field="password" />
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
              className="pr-12"
              placeholder="Re-enter your password"
              ref={el => { fieldRefs.current.confirmPassword = el; }}
              aria-invalid={errorFor('confirmPassword') ? true : undefined}
              aria-describedby={describedBy('confirmPassword')}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showConfirmPassword}
              className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <FieldError field="confirmPassword" />
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

        {/* This sentence asked people to agree to two documents that did not
            exist, were not links, and had no routes. Both are real pages now and
            both open in a new tab, so nothing you have typed into this form is
            lost by going to read them. */}
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          By creating an account you agree to the DeckMatrix{' '}
          <Link
            to="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            terms of use
          </Link>{' '}
          and{' '}
          <Link
            to="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            privacy page
          </Link>
          .
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
