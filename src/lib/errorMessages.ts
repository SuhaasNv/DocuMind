import { toast } from 'sonner';
import { useAppStore } from '@/stores/useAppStore';

/**
 * Central user-facing error/status strings.
 * Every message: plain language + a next step. No error codes, no jargon.
 */
export const ERROR_MESSAGES = {
  networkUnreachable:
    "We couldn't reach the server. Check your internet connection and try again.",
  sessionExpired: 'Your session expired — please sign in again.',
  uploadFailed: "The upload didn't go through. Check your connection and try again.",
  pdfTooLarge: 'This PDF is larger than 50MB. Try a smaller file.',
  notAPdf: 'Only PDF files are supported. Choose a .pdf file and try again.',
  genericRetry: 'Something went wrong. Please try again.',
} as const;

/** Upload trust states (shown during/after the file POST). */
export const UPLOAD_STATUS = {
  keepTabOpen: 'Uploading — keep this tab open',
  safeToLeave: 'Safe to leave — processing continues in the background',
} as const;

/** Browser fetch network failures surface as these raw messages. */
const NETWORK_ERROR_RE =
  /failed to fetch|networkerror|network request failed|load failed/i;

export function isNetworkError(err: unknown): boolean {
  return err instanceof Error && NETWORK_ERROR_RE.test(err.message);
}

/**
 * One place every authenticated call routes its 401 through: clear auth so
 * ProtectedRoute sends the user to sign-in, show a friendly toast once, and
 * throw the friendly message so callers surface it instead of a raw 401.
 */
export function checkSessionExpired(res: Response): void {
  if (res.status !== 401) return;
  const store = useAppStore.getState();
  if (store.isAuthenticated || store.accessToken) {
    store.setAuthenticated(false, null, null);
    toast.error(ERROR_MESSAGES.sessionExpired);
  }
  throw new Error(ERROR_MESSAGES.sessionExpired);
}
