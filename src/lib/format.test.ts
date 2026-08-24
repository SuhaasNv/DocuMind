import { describe, expect, it } from 'vitest';
import { formatFileSize, stageLabel } from './format';

describe('formatFileSize', () => {
  it('returns empty string for unknown/invalid sizes', () => {
    expect(formatFileSize(undefined)).toBe('');
    expect(formatFileSize(null)).toBe('');
    expect(formatFileSize(-1)).toBe('');
    expect(formatFileSize(Number.NaN)).toBe('');
  });

  it('formats bytes below 1 KB', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats KB and MB with one decimal under 10', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('rounds to whole numbers at 10 and above', () => {
    expect(formatFileSize(10 * 1024)).toBe('10 KB');
    expect(formatFileSize(48 * 1024 * 1024)).toBe('48 MB');
  });

  it('formats GB', () => {
    expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
  });
});

describe('stageLabel', () => {
  it('maps real processing stages', () => {
    expect(stageLabel('EXTRACTING', 'PROCESSING')).toBe('Extracting text…');
    expect(stageLabel('CHUNKING', 'PROCESSING')).toBe('Chunking pages…');
    expect(stageLabel('EMBEDDING', 'PROCESSING')).toBe('Generating embeddings…');
    expect(stageLabel('FINALIZING', 'PROCESSING')).toBe('Finalizing…');
  });

  it('falls back to status wording without a stage', () => {
    expect(stageLabel(null, 'PENDING')).toBe('Queued…');
    expect(stageLabel(undefined, 'PROCESSING')).toBe('Processing…');
  });

  it('returns empty for terminal statuses', () => {
    expect(stageLabel(null, 'DONE')).toBe('');
    expect(stageLabel(null, 'FAILED')).toBe('');
  });

  it('ignores unknown stage values', () => {
    expect(stageLabel('SOMETHING_NEW', 'PROCESSING')).toBe('Processing…');
  });
});
