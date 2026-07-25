/**
 * Normalizes a URL string.
 * If the URL does not contain a scheme (like http://, https://, mailto:, tel:, ftp://)
 * and is not an absolute/hash path (like / or #), automatically prepends 'https://'.
 */
export function normalizeUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  // Already has protocol, scheme, or absolute/relative route
  if (/^(?:[a-z0-9+.-]+:|\/\/|\/|#)/i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}
