/**
 * Pure helper for the PDF download Content-Disposition header. Kept free of
 * Nest/Express so header-injection-critical logic (CRLF/quote stripping) is
 * unit-testable in isolation. @see documents.controller.ts GET :id/file
 */

/** CR, LF, double quotes, semicolons and path separators — strip before the
 * name reaches any header value (prevents header/response splitting and
 * directory-ish filenames). */
const FORBIDDEN_CHARS_RE = /[\r\n";\\/]/g;

/**
 * Builds a full `Content-Disposition: attachment` header value for a document
 * name, with both a sanitized ASCII `filename` and a percent-encoded UTF-8
 * `filename*` fallback (RFC 5987) for non-ASCII names.
 */
export function buildContentDisposition(documentName: string): string {
  const stripped = documentName.replace(FORBIDDEN_CHARS_RE, '').trim();
  const base = (stripped || 'document').replace(/\.pdf$/i, '');
  const asciiBase = base.replace(/[^\x20-\x7E]/g, '_').trim() || 'document';
  const asciiFilename = `${asciiBase}.pdf`;
  const utf8Filename = encodeURIComponent(`${base || 'document'}.pdf`);
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`;
}
