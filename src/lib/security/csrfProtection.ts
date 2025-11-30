/**
 * CSRF Protection utilities
 * Generates and validates CSRF tokens for form submissions
 */

const CSRF_TOKEN_KEY = 'csrf_token';
const TOKEN_LENGTH = 32;

/**
 * Generate a random CSRF token
 */
function generateToken(): string {
  const array = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create CSRF token for current session
 */
export function getCSRFToken(): string {
  let token = sessionStorage.getItem(CSRF_TOKEN_KEY);
  
  if (!token) {
    token = generateToken();
    sessionStorage.setItem(CSRF_TOKEN_KEY, token);
  }
  
  return token;
}

/**
 * Validate CSRF token from form submission
 */
export function validateCSRFToken(token: string): boolean {
  const sessionToken = sessionStorage.getItem(CSRF_TOKEN_KEY);
  
  if (!sessionToken || !token) {
    return false;
  }
  
  return token === sessionToken;
}

/**
 * Add CSRF token to form data
 */
export function addCSRFTokenToFormData(formData: FormData): void {
  formData.append('csrf_token', getCSRFToken());
}

/**
 * Add CSRF token to JSON payload
 */
export function addCSRFTokenToJSON<T extends Record<string, any>>(data: T): T & { csrf_token: string } {
  return {
    ...data,
    csrf_token: getCSRFToken(),
  };
}

/**
 * Verify CSRF token from request data
 */
export function verifyCSRFFromRequest(data: any): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  const token = data.csrf_token || data.csrfToken;
  return validateCSRFToken(token);
}

/**
 * Create CSRF-protected form submit handler
 */
export function createCSRFProtectedSubmit<T>(
  onSubmit: (data: T) => Promise<void> | void
) {
  return async (data: T) => {
    const token = getCSRFToken();
    const dataWithToken = { ...data, csrf_token: token } as any;
    
    if (!validateCSRFToken(token)) {
      throw new Error('Invalid CSRF token');
    }
    
    return onSubmit(dataWithToken);
  };
}

/**
 * Refresh CSRF token (call after login/logout)
 */
export function refreshCSRFToken(): string {
  const token = generateToken();
  sessionStorage.setItem(CSRF_TOKEN_KEY, token);
  return token;
}

/**
 * Clear CSRF token (call on logout)
 */
export function clearCSRFToken(): void {
  sessionStorage.removeItem(CSRF_TOKEN_KEY);
}
