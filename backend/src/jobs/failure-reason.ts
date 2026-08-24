/**
 * Map a processing error to a SAFE, user-facing failure reason.
 * Never returns raw error messages, stack traces, or file paths.
 */

export const FAILURE_REASONS = {
  missingFile: 'The uploaded file is missing. Please upload it again.',
  invalidPdf: 'The file could not be read as a valid PDF.',
  noText:
    'No extractable text was found in this PDF (it may be scanned or image-only).',
  provider:
    'A processing service was temporarily unavailable. Please retry in a moment.',
  generic: 'Processing failed. Please retry or re-upload the PDF.',
} as const;

const INVALID_PDF_PATTERNS = [
  'invalid pdf',
  'bad xref',
  'xref',
  'password',
  'encrypted',
  'corrupt',
  'malformed',
  'formaterror',
  'invalidpdfexception',
];

const PROVIDER_PATTERNS = [
  'fetch failed',
  'econnrefused',
  'econnreset',
  'etimedout',
  'timeout',
  'timed out',
  'rate limit',
  '429',
  'quota',
  'api key',
  'apikey',
  'unauthorized',
  '401',
  '503',
  'openai',
  'embedding',
  'socket hang up',
  'network',
];

const NO_TEXT_PATTERNS = ['no extractable text'];

export function mapFailureReason(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const msg = raw.toLowerCase();
  if (!msg) return FAILURE_REASONS.generic;
  if (msg.includes('enoent') || msg.includes('no file path')) {
    return FAILURE_REASONS.missingFile;
  }
  if (NO_TEXT_PATTERNS.some((p) => msg.includes(p))) {
    return FAILURE_REASONS.noText;
  }
  if (INVALID_PDF_PATTERNS.some((p) => msg.includes(p))) {
    return FAILURE_REASONS.invalidPdf;
  }
  if (PROVIDER_PATTERNS.some((p) => msg.includes(p))) {
    return FAILURE_REASONS.provider;
  }
  return FAILURE_REASONS.generic;
}
