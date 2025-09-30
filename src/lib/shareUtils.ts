/**
 * Generate a cryptographically secure random slug
 * @param length - Length of slug (default 8)
 * @returns Base62 slug
 */
export function generateSlug(length = 8): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => alphabet[byte % alphabet.length]).join("");
}

/**
 * Get public share URL for a deck
 * @param slug - Deck slug
 * @returns Full public URL
 */
export function getShareUrl(slug: string): string {
  return `${window.location.origin}/p/${slug}`;
}

/**
 * Hash a string for analytics (basic privacy)
 * @param input - String to hash
 * @returns Hashed string
 */
export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}
