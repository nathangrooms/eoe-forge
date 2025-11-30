/**
 * Input sanitization utilities to prevent XSS attacks
 */

/**
 * Sanitize HTML string by encoding special characters
 */
export function sanitizeHTML(input: string): string {
  if (!input) return '';
  
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  
  return input.replace(/[&<>"'/]/g, (char) => map[char]);
}

/**
 * Sanitize string for use in SQL-like queries (though we use Supabase which handles this)
 */
export function sanitizeQuery(input: string): string {
  if (!input) return '';
  return input.replace(/['";\\]/g, '');
}

/**
 * Sanitize card name input - allow letters, numbers, spaces, hyphens, apostrophes, commas
 */
export function sanitizeCardName(input: string): string {
  if (!input) return '';
  return input.replace(/[^a-zA-Z0-9\s\-',]/g, '');
}

/**
 * Sanitize numeric input - only allow numbers and decimal point
 */
export function sanitizeNumber(input: string): string {
  if (!input) return '';
  return input.replace(/[^0-9.]/g, '');
}

/**
 * Sanitize email input
 */
export function sanitizeEmail(input: string): string {
  if (!input) return '';
  return input.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '');
}

/**
 * Validate and sanitize URL
 */
export function sanitizeURL(input: string): string | null {
  if (!input) return null;
  
  try {
    const url = new URL(input);
    // Only allow http and https protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Remove all HTML tags from string
 */
export function stripHTML(input: string): string {
  if (!input) return '';
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize deck name or collection name
 */
export function sanitizeName(input: string, maxLength: number = 100): string {
  if (!input) return '';
  return sanitizeHTML(input.trim()).slice(0, maxLength);
}
