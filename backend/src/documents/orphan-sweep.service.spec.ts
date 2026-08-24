import { selectOrphans, ORPHAN_MAX_AGE_MS } from './orphan-sweep.service';

const NOW = 10 * ORPHAN_MAX_AGE_MS;
const OLD = NOW - ORPHAN_MAX_AGE_MS - 1;
const RECENT = NOW - 60_000;

describe('selectOrphans (pure orphan decision)', () => {
  it('deletes files older than 1h with no referencing filePath', () => {
    expect(selectOrphans([{ name: 'abc.pdf', mtimeMs: OLD }], [], NOW)).toEqual(
      ['abc.pdf'],
    );
  });

  it('keeps recent files even when unreferenced (upload row may not exist yet)', () => {
    expect(
      selectOrphans([{ name: 'abc.pdf', mtimeMs: RECENT }], [], NOW),
    ).toEqual([]);
  });

  it('keeps old files referenced by a Document filePath', () => {
    expect(
      selectOrphans(
        [{ name: 'abc.pdf', mtimeMs: OLD }],
        ['uploads/abc.pdf'],
        NOW,
      ),
    ).toEqual([]);
  });

  it('mixes: only the old unreferenced file is selected', () => {
    expect(
      selectOrphans(
        [
          { name: 'kept-recent.pdf', mtimeMs: RECENT },
          { name: 'kept-referenced.pdf', mtimeMs: OLD },
          { name: 'orphan.pdf', mtimeMs: OLD },
        ],
        ['uploads/kept-referenced.pdf'],
        NOW,
      ),
    ).toEqual(['orphan.pdf']);
  });

  it('a file exactly at the age threshold is kept (strictly older only)', () => {
    expect(
      selectOrphans(
        [{ name: 'edge.pdf', mtimeMs: NOW - ORPHAN_MAX_AGE_MS }],
        [],
        NOW,
      ),
    ).toEqual([]);
  });
});
