import { getApiBaseUrl, getApiErrorMessage } from './api';
import { checkSessionExpired, ERROR_MESSAGES } from './errorMessages';

/**
 * Downloads a document's original PDF: fetches it with the caller's JWT
 * (same GET /documents/:id/file endpoint the citation viewer streams from,
 * with ?download=1 so the server sets Content-Disposition: attachment),
 * then triggers a browser save via a transient <a download> click.
 *
 * Used from both DocumentCard and DataPage — the one download code path.
 */
export async function downloadDocument(
  token: string,
  documentId: string,
  documentName: string,
): Promise<void> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new Error(ERROR_MESSAGES.networkUnreachable);
  }

  let res: Response;
  try {
    res = await fetch(`${base}/documents/${documentId}/file?download=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new Error(getApiErrorMessage(err, ERROR_MESSAGES.genericRetry));
  }

  if (!res.ok) {
    // Clears auth + shows the session-expired toast on 401, then throws.
    checkSessionExpired(res);
    if (res.status === 404) {
      throw new Error('The original file is no longer available');
    }
    throw new Error(ERROR_MESSAGES.genericRetry);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const name = documentName.toLowerCase().endsWith('.pdf')
      ? documentName
      : `${documentName}.pdf`;
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
