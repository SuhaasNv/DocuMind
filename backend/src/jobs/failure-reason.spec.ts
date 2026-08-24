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
