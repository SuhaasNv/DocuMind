/**
 * Standalone LLM-as-judge client. Deliberately independent of
 * src/rag/llm.service.ts (no Nest bootstrap needed for a CLI eval script,
 * and the judge must not share code paths with the system under test).
 * Supports openai and gemini; provider/model/key come from env so CI can
 * pin whichever is configured without code changes.
 */
import {
  JUDGE_SYSTEM_PROMPT,
  buildJudgeUserPrompt,
  type JudgeInput,
  type JudgeVerdict,
} from '../judge-prompt';

const JUDGE_PROVIDER = process.env.JUDGE_LLM_PROVIDER ?? 'openai';

function parseVerdict(raw: string): JudgeVerdict {
  // Strip accidental markdown fences; judge prompt forbids them, but don't
  // let a stray ```json``` wrapper crash a whole eval run.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const parsed: unknown = JSON.parse(cleaned);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('groundedness' in parsed) ||
    !('citationValid' in parsed) ||
    !('mentionsCovered' in parsed)
  ) {
    throw new Error(`Judge returned malformed verdict: ${raw}`);
  }
  const p = parsed as Record<string, unknown>;
  return {
    groundedness: Number(p.groundedness),
    citationValid: Boolean(p.citationValid),
    mentionsCovered: Boolean(p.mentionsCovered),
    notes: typeof p.notes === 'string' ? p.notes : '',
  };
}

async function callOpenAiJudge(userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is required when JUDGE_LLM_PROVIDER=openai',
    );
  }
  const model = process.env.JUDGE_OPENAI_MODEL ?? 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: JUDGE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Judge OpenAI request failed: ${res.status} ${await res.text()}`,
    );
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string')
    throw new Error('Judge OpenAI returned no content');
  return content;
}

async function callGeminiJudge(userPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is required when JUDGE_LLM_PROVIDER=gemini',
    );
  }
  const model = process.env.JUDGE_GEMINI_MODEL ?? 'gemini-2.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: `${JUDGE_SYSTEM_PROMPT}\n\n${userPrompt}` }] },
        ],
        generationConfig: { temperature: 0 },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `Judge Gemini request failed: ${res.status} ${await res.text()}`,
    );
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('');
  if (!text) throw new Error('Judge Gemini returned no content');
  return text;
}

/** Grade one answer against its fixture's ground truth. Throws on API/parse failure. */
export async function judgeAnswer(input: JudgeInput): Promise<JudgeVerdict> {
  const userPrompt = buildJudgeUserPrompt(input);
  const raw =
    JUDGE_PROVIDER === 'gemini'
      ? await callGeminiJudge(userPrompt)
      : await callOpenAiJudge(userPrompt);
  return parseVerdict(raw);
}
