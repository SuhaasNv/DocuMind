import { FAILURE_REASONS, mapFailureReason } from './failure-reason';

describe('mapFailureReason', () => {
  it('maps invalid PDF parser errors', () => {
    expect(mapFailureReason(new Error('Invalid PDF structure'))).toBe(
      FAILURE_REASONS.invalidPdf,
    );
    expect(mapFailureReason(new Error('bad XRef entry'))).toBe(
      FAILURE_REASONS.invalidPdf,
    );
  });

  it('maps provider/network failures', () => {
    expect(mapFailureReason(new Error('fetch failed'))).toBe(
      FAILURE_REASONS.provider,
    );
    expect(
      mapFailureReason(new Error('OpenAI error 429: rate limit exceeded')),
    ).toBe(FAILURE_REASONS.provider);
  });

  it('maps missing-file errors', () => {
    expect(
      mapFailureReason(
        new Error(
          "ENOENT: no such file or directory, open '/srv/uploads/x.pdf'",
        ),
      ),
    ).toBe(FAILURE_REASONS.missingFile);
  });

  it('maps no-extractable-text errors', () => {
    expect(mapFailureReason(new Error('no extractable text in document'))).toBe(
      FAILURE_REASONS.noText,
    );
  });

  it('maps password-protected PDFs distinctly from corrupt ones', () => {
    // pdf.js throws PasswordException with message "No password given".
    const pw = new Error('No password given');
    pw.name = 'PasswordException';
    expect(mapFailureReason(pw)).toBe(FAILURE_REASONS.passwordProtected);
    expect(mapFailureReason(new Error('File is encrypted'))).toBe(
      FAILURE_REASONS.passwordProtected,
    );
    expect(mapFailureReason(pw)).not.toBe(FAILURE_REASONS.invalidPdf);
  });

  it('maps pdf.js exception names carried on err.name', () => {
    const invalid = new Error('PDF header not found');
    invalid.name = 'InvalidPDFException';
    expect(mapFailureReason(invalid)).toBe(FAILURE_REASONS.invalidPdf);
  });

  it('falls back to the generic message for unknown errors', () => {
    expect(mapFailureReason(new Error('something odd happened'))).toBe(
      FAILURE_REASONS.generic,
    );
  });

  it('every user-facing reason is jargon-free and distinct', () => {
    const reasons = Object.values(FAILURE_REASONS);
    for (const reason of reasons) {
      expect(reason).not.toMatch(/chunk|embedding|token|xref|redis|enoent/i);
    }
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it('never leaks raw error details, stacks, or paths', () => {
    const nasty = new Error(
      'boom at /Users/secret/backend/src/jobs/document.processor.ts:120',
    );
    const mapped = mapFailureReason(nasty);
    expect(mapped).toBe(FAILURE_REASONS.generic);
    expect(mapped).not.toContain('/Users');
    expect(mapped).not.toContain('boom');
  });

  it('handles non-Error inputs', () => {
    expect(mapFailureReason(undefined)).toBe(FAILURE_REASONS.generic);
    expect(mapFailureReason('ECONNREFUSED 127.0.0.1:11434')).toBe(
      FAILURE_REASONS.provider,
    );
  });
});
