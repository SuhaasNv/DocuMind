import { describe, expect, it, beforeEach } from 'vitest';
import {
  checkSessionExpired,
  ERROR_MESSAGES,
  isNetworkError,
  UPLOAD_STATUS,
} from './errorMessages';
import { getApiErrorMessage } from './api';
import { useAppStore } from '@/stores/useAppStore';

describe('ERROR_MESSAGES copy', () => {
  it('is plain language: no jargon, codes, or dead ends', () => {
    for (const message of [
      ...Object.values(ERROR_MESSAGES),
      ...Object.values(UPLOAD_STATUS),
    ]) {
      expect(message).not.toMatch(/chunk|embedding|token|backend|http|\b\d{3}\b/i);
      expect(message.length).toBeGreaterThan(10);
    }
  });
});

describe('checkSessionExpired (shared 401 guard)', () => {
  beforeEach(() => {
    useAppStore.getState().setAuthenticated(
      true,
      { id: 'u1', email: 'a@b.c', name: 'A' },
      'jwt-token',
    );
  });

  it('clears auth and throws the friendly message on 401', () => {
    expect(() =>
      checkSessionExpired(new Response(null, { status: 401 })),
    ).toThrow(ERROR_MESSAGES.sessionExpired);
    expect(useAppStore.getState().isAuthenticated).toBe(false);
    expect(useAppStore.getState().accessToken).toBeNull();
  });

  it('does nothing for non-401 responses', () => {
    checkSessionExpired(new Response(null, { status: 500 }));
    expect(useAppStore.getState().isAuthenticated).toBe(true);
    expect(useAppStore.getState().accessToken).toBe('jwt-token');
  });
});

describe('getApiErrorMessage network mapping', () => {
  it('maps raw browser network errors to the friendly message', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(getApiErrorMessage(new TypeError('Failed to fetch'))).toBe(
      ERROR_MESSAGES.networkUnreachable,
    );
    expect(getApiErrorMessage(new TypeError('Load failed'))).toBe(
      ERROR_MESSAGES.networkUnreachable,
    );
  });

  it('passes through specific server messages unchanged', () => {
    expect(getApiErrorMessage(new Error('Only PDF files are allowed'))).toBe(
      'Only PDF files are allowed',
    );
  });

  it('falls back to a friendly generic message', () => {
    expect(getApiErrorMessage(undefined)).toBe(ERROR_MESSAGES.genericRetry);
  });
});
