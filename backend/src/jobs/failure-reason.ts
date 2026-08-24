/**
 * Map a processing error to a SAFE, user-facing failure reason.
 * Never returns raw error messages, stack traces, or file paths.
 */

export const FAILURE_REASONS = {
  missingFile: 'The uploaded file is missing. Please upload it again.',
  passwordProtected:
    'This PDF is password-protected. Remove the password and re-upload.',
  invalidPdf:
    'This file could not be read as a PDF. It may be corrupt — try re-exporting it.',
  noText:
    "This PDF appears to be scanned images with no selectable text. Try a text-based PDF or an OCR'd copy.",
  provider:
    'A processing service was temporarily unavailable. Please retry in a moment.',
  generic: 'Processing failed. Please retry or re-upload the PDF.',
} as const;

/** pdf.js/pdf-parse encrypted-PDF signatures (PasswordException etc.). */
const PASSWORD_PATTERNS = [
  'password',
  'encrypted',
  'needpassword',
  'passwordexception',
];

const INVALID_PDF_PATTERNS = [
  'invalid pdf',
  'bad xref',
  'xref',
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
  // Include the error name: pdf.js signals via names like PasswordException
  // and InvalidPDFException, with messages that may not repeat them.
  const raw =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === 'string'
        ? err
        : '';
  const msg = raw.toLowerCase();
  if (!msg) return FAILURE_REASONS.generic;
  if (msg.includes('enoent') || msg.includes('no file path')) {
    return FAILURE_REASONS.missingFile;
  }
  if (NO_TEXT_PATTERNS.some((p) => msg.includes(p))) {
    return FAILURE_REASONS.noText;
  }
  if (PASSWORD_PATTERNS.some((p) => msg.includes(p))) {
    return FAILURE_REASONS.passwordProtected;
  }
  if (INVALID_PDF_PATTERNS.some((p) => msg.includes(p))) {
    return FAILURE_REASONS.invalidPdf;
  }
  if (PROVIDER_PATTERNS.some((p) => msg.includes(p))) {
    return FAILURE_REASONS.provider;
  }
  return FAILURE_REASONS.generic;
}
