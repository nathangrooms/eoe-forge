/**
 * One password policy for the whole app.
 *
 * Settings, Register and UpdatePasswordForm each carried their own copy of the
 * rule (all three said "6 characters"), so they could drift apart silently.
 * Every surface that sets a password imports from here instead.
 */

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULE_TEXT = `At least ${PASSWORD_MIN_LENGTH} characters.`;

export interface PasswordCheck {
  valid: boolean;
  /** Human-readable reason, present only when `valid` is false. */
  message?: string;
}

/** Validates a single new password against the policy. */
export function validatePassword(password: string): PasswordCheck {
  if (!password) {
    return { valid: false, message: 'Enter a password.' };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  return { valid: true };
}

/** Validates a new password plus its confirmation field. */
export function validatePasswordPair(
  password: string,
  confirmation: string
): PasswordCheck {
  const base = validatePassword(password);
  if (!base.valid) return base;

  if (password !== confirmation) {
    return { valid: false, message: 'Passwords do not match.' };
  }
  return { valid: true };
}
