import { describe, expect, it, vi } from 'vitest';
import { runBatchUpload, suggestCollectionName, type BatchFileState } from './batchUpload';

function makeFiles(names: string[]): File[] {
  return names.map((name) => new File(['%PDF-1.4'], name, { type: 'application/pdf' }));
}

describe('runBatchUpload', () => {
  it('one file failing does not abort the rest — partial failure reports the truth', async () => {
    const files = makeFiles(['a.pdf', 'b.pdf', 'c.pdf']);
    const states: BatchFileState[] = files.map(() => ({ status: 'queued' }));
    const attached: string[] = [];

    await runBatchUpload(files, {
      concurrency: 3,
      uploadOne: async (file) => {
        if (file.name === 'b.pdf') throw new Error('Only PDF files are allowed');
        return { id: `doc-${file.name}` };
      },
      attachOne: async (id) => {
        attached.push(id);
      },
      onUpdate: (index, patch) => {
        states[index] = { ...states[index], ...patch };
      },
    });

    expect(states[0].status).toBe('done');
    expect(states[1].status).toBe('failed');
    expect(states[1].error).toBe('Only PDF files are allowed');
    expect(states[2].status).toBe('done');

    // The truth: 2 of 3 uploaded, 1 failed — never a false-positive success.
    const doneCount = states.filter((s) => s.status === 'done').length;
    const failedCount = states.filter((s) => s.status === 'failed').length;
    expect(doneCount).toBe(2);
    expect(failedCount).toBe(1);

    // Only the successfully uploaded docs were attached to the collection.
    expect(attached.sort()).toEqual(['doc-a.pdf', 'doc-c.pdf']);
  });

  it('a document that uploads fine but fails to attach still counts as done', async () => {
    const files = makeFiles(['a.pdf']);
    const states: BatchFileState[] = [{ status: 'queued' }];

    await runBatchUpload(files, {
      concurrency: 2,
      uploadOne: async (file) => ({ id: `doc-${file.name}` }),
      attachOne: async () => {
        throw new Error('collection deleted');
      },
      onUpdate: (index, patch) => {
        states[index] = { ...states[index], ...patch };
      },
    });

    expect(states[0].status).toBe('done');
    expect(states[0].documentId).toBe('doc-a.pdf');
  });

  it('never runs more than `concurrency` uploads at once', async () => {
    const files = makeFiles(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf']);
    let inFlight = 0;
    let maxInFlight = 0;

    await runBatchUpload(files, {
      concurrency: 2,
      uploadOne: async (file) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { id: `doc-${file.name}` };
      },
      attachOne: async () => {},
      onUpdate: () => {},
    });

    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('all-success batch reports a true "N of N" summary', async () => {
    const files = makeFiles(['a.pdf', 'b.pdf']);
    const states: BatchFileState[] = files.map(() => ({ status: 'queued' }));

    await runBatchUpload(files, {
      concurrency: 3,
      uploadOne: async (file) => ({ id: `doc-${file.name}` }),
      attachOne: async () => {},
      onUpdate: (index, patch) => {
        states[index] = { ...states[index], ...patch };
      },
    });

    expect(states.every((s) => s.status === 'done')).toBe(true);
  });
});

describe('suggestCollectionName', () => {
  it('uses the common filename prefix when meaningful', () => {
    const files = makeFiles(['invoice-jan.pdf', 'invoice-feb.pdf', 'invoice-mar.pdf']);
    expect(suggestCollectionName(files)).toBe('invoice');
  });

  it('falls back to "Upload <date>" when there is no meaningful common prefix', () => {
    const files = makeFiles(['a.pdf', 'b.pdf']);
    const now = new Date('2026-08-24T00:00:00Z');
    expect(suggestCollectionName(files, now)).toMatch(/^Upload /);
  });
});
