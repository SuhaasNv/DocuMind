import * as crypto from 'node:crypto';
import {
  SHARE_TOKEN_RE,
  buildSnapshot,
  generateShareToken,
  shareState,
} from './share.util.js';

// Wrap the real randomBytes in a jest.fn so we can assert the token comes
// from the CSPRNG (node builtins reject jest.spyOn redefinition).
jest.mock('node:crypto', () => {
  const actual =
    jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { ...actual, randomBytes: jest.fn(actual.randomBytes) };
});

describe('generateShareToken', () => {
  it('is 32 lowercase hex chars (128 bits) and matches the public gate regex', () => {
    const token = generateShareToken();
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    expect(SHARE_TOKEN_RE.test(token)).toBe(true);
  });

  it('is unique across 1000 generations with no shared 16-char prefixes', () => {
    const tokens = Array.from({ length: 1000 }, () => generateShareToken());
    expect(new Set(tokens).size).toBe(1000);
    const prefixes = new Set(tokens.map((t) => t.slice(0, 16)));
    expect(prefixes.size).toBe(1000); // non-sequential: prefixes never repeat
  });

  it('uses crypto.randomBytes (CSPRNG, not Math.random)', () => {
    const mocked = crypto.randomBytes as jest.MockedFunction<
      typeof crypto.randomBytes
    >;
    mocked.mockClear();
    const token = generateShareToken();
    expect(mocked).toHaveBeenCalledWith(16);
    expect(token).toHaveLength(32);
  });
});

describe('buildSnapshot (whitelist serializer)', () => {
  const now = new Date('2026-08-25T12:00:00.000Z');

  it('produces exactly {question, answer, sources, sharedAt} with exact source keys', () => {
    const snap = buildSnapshot(
      {
        question: 'What is the revenue?',
        answer: 'It grew 12% [1].',
        sources: [
          {
            marker: 1,
            pageStart: 2,
            pageEnd: 3,
            quote: 'grew by twelve percent',
            snippet: 'revenue grew',
          },
        ],
      },
      now,
    );
    expect(Object.keys(snap).sort()).toEqual([
      'answer',
      'question',
      'sharedAt',
      'sources',
    ]);
    expect(Object.keys(snap.sources[0]).sort()).toEqual([
      'marker',
      'pageEnd',
      'pageStart',
      'quote',
      'snippet',
    ]);
    expect(snap).toEqual({
      question: 'What is the revenue?',
      answer: 'It grew 12% [1].',
      sources: [
        {
          marker: 1,
          pageStart: 2,
          pageEnd: 3,
          quote: 'grew by twelve percent',
          snippet: 'revenue grew',
        },
      ],
      sharedAt: '2026-08-25T12:00:00.000Z',
    });
  });

  it('strips hostile extra and nested keys (chunkIndex, score, documentId, filePath, nested objects)', () => {
    const snap = buildSnapshot(
      {
        question: 'q',
        answer: 'a',
        sources: [
          {
            marker: 2,
            snippet: 'ok',
            chunkIndex: 7,
            score: 0.99,
            documentId: 'doc_123',
            filePath: '/uploads/secret.pdf',
            user: { email: 'victim@example.com' },
            quote: 'fine',
            nested: { deeper: { chunkIndex: 9 } },
          },
        ],
      },
      now,
    );
    const json = JSON.stringify(snap);
    expect(json).not.toContain('chunkIndex');
    expect(json).not.toContain('score');
    expect(json).not.toContain('documentId');
    expect(json).not.toContain('secret.pdf');
    expect(json).not.toContain('victim@example.com');
    expect(Object.keys(snap.sources[0]).sort()).toEqual([
      'marker',
      'pageEnd',
      'pageStart',
      'quote',
      'snippet',
    ]);
  });

  it('coerces wrong-typed values instead of passing them through', () => {
    const snap = buildSnapshot(
      {
        question: 'q',
        answer: 'a',
        sources: [
          {
            marker: 'DROP TABLE',
            pageStart: 'one',
            quote: { evil: true },
            snippet: 42,
          },
          {},
        ],
      },
      now,
    );
    expect(snap.sources[0]).toEqual({
      marker: 1,
      pageStart: null,
      pageEnd: null,
      quote: null,
      snippet: '',
    });
    expect(snap.sources[1]).toEqual({
      marker: 2,
      pageStart: null,
      pageEnd: null,
      quote: null,
      snippet: '',
    });
  });

  it('caps sources at 20 and lets <script> pass through as inert string data', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      marker: i + 1,
      snippet: 's',
    }));
    const snap = buildSnapshot(
      {
        question: '<script>alert(1)</script>',
        answer: '<script>x</script>',
        sources: many,
      },
      now,
    );
    expect(snap.sources).toHaveLength(20);
    // XSS defense is at render time (ReactMarkdown, no rehype-raw); data is stored verbatim.
    expect(snap.question).toBe('<script>alert(1)</script>');
    expect(snap.answer).toBe('<script>x</script>');
  });
});

describe('shareState (revocation/expiry decision)', () => {
  const now = new Date('2026-08-25T12:00:00.000Z');

  it('live when not revoked and no expiry', () => {
    expect(shareState({ revoked: false, expiresAt: null }, now)).toBe('live');
  });

  it('gone when revoked, even with a future expiry', () => {
    expect(shareState({ revoked: true, expiresAt: null }, now)).toBe('gone');
    expect(
      shareState({ revoked: true, expiresAt: new Date('2027-01-01') }, now),
    ).toBe('gone');
  });

  it('gone when expired (past or exactly now), live when expiry is in the future', () => {
    expect(
      shareState(
        { revoked: false, expiresAt: new Date('2026-08-25T11:59:59Z') },
        now,
      ),
    ).toBe('gone');
    expect(shareState({ revoked: false, expiresAt: now }, now)).toBe('gone');
    expect(
      shareState(
        { revoked: false, expiresAt: new Date('2026-08-25T12:00:01Z') },
        now,
      ),
    ).toBe('live');
  });
});
