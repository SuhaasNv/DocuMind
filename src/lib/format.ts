/** Pure formatting helpers for document cards (unit-tested). */

import type { DocumentStatus } from '@/stores/useAppStore';

/** Human file size: 512 B, 1.5 KB, 12 MB, 1.2 GB. Empty string for unknown. */
export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit++;
  } while (value >= 1024 && unit < units.length - 1);
  const rounded = value >= 10 ? String(Math.round(value)) : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

/** Real processing stage → human label. Falls back to status wording. */
export function stageLabel(
  stage: string | null | undefined,
  status: DocumentStatus,
): string {
  switch (stage) {
    case 'EXTRACTING':
      return 'Extracting text…';
    case 'CHUNKING':
      return 'Chunking pages…';
    case 'EMBEDDING':
      return 'Generating embeddings…';
    case 'FINALIZING':
      return 'Finalizing…';
    default:
      break;
  }
  if (status === 'PENDING') return 'Queued…';
  if (status === 'PROCESSING') return 'Processing…';
  return '';
}
