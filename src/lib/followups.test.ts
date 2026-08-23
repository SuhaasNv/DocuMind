import { describe, expect, it } from 'vitest';
import { parseFollowups, stripStreamingTail } from './followups';

describe('parseFollowups', () => {
  it('parses a well-formed trailing FOLLOWUPS line', () => {
    const { display, followUps } = parseFollowups(
      'Answer.\n\nFOLLOWUPS: ["a?","b?","c?"]',
    );
    expect(display).toBe('Answer.');
    expect(followUps).toEqual(['a?', 'b?', 'c?']);
  });

  it('leaves answers without a marker untouched', () => {
    expect(parseFollowups('Plain answer.')).toEqual({
      display: 'Plain answer.',
      followUps: [],
    });
  });

  it('strips the line but yields no chips on malformed JSON', () => {
    const { display, followUps } = parseFollowups('Answer.\nFOLLOWUPS: [broken');
    expect(display).toBe('Answer.');
    expect(followUps).toEqual([]);
  });

  it('handles a markdown-fenced marker line', () => {
    const { display, followUps } = parseFollowups(
      'Answer.\n```json\nFOLLOWUPS: ["a"]\n```',
    );
    expect(display).toBe('Answer.');
    expect(followUps).toEqual(['a']);
  });
});

describe('stripStreamingTail', () => {
  it('hides a partially-arrived marker line during streaming', () => {
    expect(stripStreamingTail('Answer.\nFOLL')).toBe('Answer.');
    expect(stripStreamingTail('Answer.\nFOLLOWUPS: ["q1')).toBe('Answer.');
  });

  it('strips a complete marker line', () => {
    expect(stripStreamingTail('Answer.\nFOLLOWUPS: ["q1","q2"]')).toBe(
      'Answer.',
    );
  });

  it('keeps ordinary text ending in similar words', () => {
    expect(stripStreamingTail('Please follow the steps.')).toBe(
      'Please follow the steps.',
    );
  });
});
