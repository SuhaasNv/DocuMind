/**
 * Pure, dependency-injected worker-pool for batch document uploads. Kept
 * free of fetch/React so the partial-failure semantics are unit-testable
 * without a DOM or network mock. @see UploadArea.tsx
 */

export type BatchFileStatus = 'queued' | 'uploading' | 'done' | 'failed';

export interface BatchFileState {
  status: BatchFileStatus;
  error?: string;
  documentId?: string;
}

export interface UploadedDocRef {
  id: string;
}

export interface BatchUploadDeps {
  /** Number of files uploaded concurrently (2-3; never Promise.all over the whole set). */
  concurrency: number;
  /** POST the single file; throws with a user-facing message on failure. */
  uploadOne: (file: File) => Promise<UploadedDocRef>;
  /** Attach an uploaded document to the batch's collection. A failure here
   * does NOT fail the file — the document uploaded successfully; only the
   * grouping step didn't land (rare: collection deleted mid-batch, etc.). */
  attachOne: (documentId: string) => Promise<void>;
  /** Called after every state transition so the UI can render live progress. */
  onUpdate: (index: number, patch: Partial<BatchFileState>) => void;
}

/**
 * Uploads `files` with a small index-based worker pool (bounded concurrency,
 * not Promise.all over the whole set). One file failing never aborts the
 * rest — each file's outcome is reported independently via onUpdate.
 */
export async function runBatchUpload(
  files: File[],
  deps: BatchUploadDeps,
): Promise<void> {
  let next = 0;

  async function worker(): Promise<void> {
    while (next < files.length) {
      const index = next++;
      deps.onUpdate(index, { status: 'uploading', error: undefined });
      try {
        const doc = await deps.uploadOne(files[index]);
        try {
          await deps.attachOne(doc.id);
        } catch {
          // Uploaded fine; grouping failed. Still a successful upload.
        }
        deps.onUpdate(index, { status: 'done', documentId: doc.id });
      } catch (err) {
        deps.onUpdate(index, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Upload failed',
        });
      }
    }
  }

  const workerCount = Math.max(1, Math.min(deps.concurrency, files.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

/** Longest common prefix of a set of (already extension-stripped) names. */
function commonPrefix(names: string[]): string {
  if (names.length === 0) return '';
  let prefix = names[0];
  for (const name of names.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < name.length && prefix[i] === name[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) break;
  }
  return prefix;
}

/**
 * Default collection name for a batch: the files' common filename prefix
 * when it's meaningful (>= 3 chars), else "Upload <date>".
 */
export function suggestCollectionName(files: File[], now: Date = new Date()): string {
  const names = files.map((f) => f.name.replace(/\.pdf$/i, ''));
  const prefix = commonPrefix(names).trim().replace(/[-_\s]+$/, '');
  if (prefix.length >= 3) return prefix;
  return `Upload ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
