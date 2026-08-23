import { ConfigService } from '@nestjs/config';
import { PromptService, type HistoryTurn } from './prompt.service.js';

function makeService(env: Record<string, string> = {}): PromptService {
  const config = {
    get: <T>(key: string, defaultValue?: T): T | string =>
      key in env ? env[key] : (defaultValue as T),
  } as ConfigService;
  return new PromptService(config);
}

const CHUNKS = [
  { content: 'Alpha facts about the project.', score: 0.9 },
  { content: 'Beta details and numbers.', score: 0.5 },
];

describe('PromptService.buildRagMessages', () => {
  it('separates roles: system rules+context, history turns, final user question', () => {
    const history: HistoryTurn[] = [
      { role: 'user', content: 'What is the codename?' },
      { role: 'assistant', content: 'It is AURORA-7.' },
    ];
    const { messages, includedPositions } = makeService().buildRagMessages(
      CHUNKS,
      'Can you elaborate?',
      history,
    );
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Document context');
    expect(messages[0].content).toContain('[1]');
    expect(messages[0].content).toContain('[2]');
    expect(messages[1]).toEqual({
      role: 'user',
      content: 'What is the codename?',
    });
    expect(messages[2]).toEqual({
      role: 'assistant',
      content: 'It is AURORA-7.',
    });
    expect(messages[3]).toEqual({
      role: 'user',
      content: 'Can you elaborate?',
    });
    expect(includedPositions).toEqual([0, 1]);
  });

  it('works with no history: system then question only', () => {
    const { messages } = makeService().buildRagMessages(CHUNKS, 'Q?');
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({ role: 'user', content: 'Q?' });
  });

  it('token-caps history keeping the NEWEST turns', () => {
    const long = 'word '.repeat(400).trim(); // ~400 tokens per turn
    const history: HistoryTurn[] = [
      { role: 'user', content: `oldest ${long}` },
      { role: 'assistant', content: `middle ${long}` },
      { role: 'user', content: 'newest short turn' },
    ];
    const { messages } = makeService({
      HISTORY_MAX_TOKENS: '500',
    }).buildRagMessages(CHUNKS, 'Q?', history);
    const historyContents = messages.slice(1, -1).map((m) => m.content);
    expect(historyContents.some((c) => c.startsWith('newest'))).toBe(true);
    expect(historyContents.some((c) => c.startsWith('oldest'))).toBe(false);
  });

  it('respects the context cap: stops adding chunks past MAX_CONTEXT_CHARS', () => {
    const big = Array.from({ length: 10 }, (_, i) => ({
      content: 'x'.repeat(500),
      score: 0.9 - i * 0.05,
    }));
    const { includedPositions } = makeService({
      MAX_CONTEXT_CHARS: '1200',
    }).buildRagMessages(big, 'Q?');
    expect(includedPositions.length).toBeGreaterThan(0);
    expect(includedPositions.length).toBeLessThan(10);
  });
});
