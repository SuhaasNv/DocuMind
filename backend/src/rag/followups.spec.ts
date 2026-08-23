import { parseFollowups } from './followups.js';

describe('parseFollowups', () => {
  it('parses a well-formed trailing FOLLOWUPS line', () => {
    const answer =
      'The project is codenamed AURORA-7.\n\nFOLLOWUPS: ["When does it launch?","Who leads it?","What is the budget?"]';
    const { display, followUps } = parseFollowups(answer);
    expect(display).toBe('The project is codenamed AURORA-7.');
    expect(followUps).toEqual([
      'When does it launch?',
      'Who leads it?',
      'What is the budget?',
    ]);
  });

  it('returns the answer untouched when FOLLOWUPS is missing', () => {
    const answer = 'Just a plain answer with no marker.';
    expect(parseFollowups(answer)).toEqual({
      display: answer,
      followUps: [],
    });
  });

  it('strips the line but yields no chips on malformed JSON', () => {
    const answer = 'Answer text.\nFOLLOWUPS: ["unterminated, oops';
    const { display, followUps } = parseFollowups(answer);
    expect(display).toBe('Answer text.');
    expect(followUps).toEqual([]);
  });

  it('handles the marker arriving split across deltas (parse on accumulated buffer)', () => {
    const deltas = ['Answer.', '\nFOLLOW', 'UPS: ["q', '1","q2"', ']'];
    const { display, followUps } = parseFollowups(deltas.join(''));
    expect(display).toBe('Answer.');
    expect(followUps).toEqual(['q1', 'q2']);
  });

  it('strips a markdown-fenced FOLLOWUPS line', () => {
    const answer = 'Answer.\n```json\nFOLLOWUPS: ["a","b","c"]\n```';
    const { display, followUps } = parseFollowups(answer);
    expect(display).toBe('Answer.');
    expect(followUps).toEqual(['a', 'b', 'c']);
  });

  it('keeps hostile content as inert strings', () => {
    const answer =
      'Answer.\nFOLLOWUPS: ["<script>alert(1)</script>","\'; DROP TABLE users; --"]';
    const { display, followUps } = parseFollowups(answer);
    expect(display).toBe('Answer.');
    expect(followUps).toEqual([
      '<script>alert(1)</script>',
      "'; DROP TABLE users; --",
    ]);
    expect(followUps.every((q) => typeof q === 'string')).toBe(true);
  });

  it('drops non-string entries and caps at 3 questions', () => {
    const answer = 'Answer.\nFOLLOWUPS: ["a", 42, "b", null, "c", "d"]';
    const { followUps } = parseFollowups(answer);
    expect(followUps).toEqual(['a', 'b', 'c']);
  });

  it('does not strip a FOLLOWUPS mention that is not the trailing line', () => {
    const answer = 'FOLLOWUPS: is a marker we use.\nMore answer text.';
    expect(parseFollowups(answer).display).toBe(answer);
  });
});
