/**
 * LLM-as-judge rubric. Deliberately separate from src/rag/prompt.service.ts's
 * RAG_RULES — the judge must never share wording with the system under test,
 * or a prompt bug in one could pass itself off as correct in the other.
 */

export interface JudgeInput {
  question: string;
  answer: string;
  /** The eval fixture's full known-good source text (ground truth), not the retrieved chunks. */
  groundTruthText: string;
  /** Substrings the answer is expected to mention (from the eval case). */
  mustMention: string[];
}

export interface JudgeVerdict {
  groundedness: number; // 1-5
  citationValid: boolean;
  mentionsCovered: boolean;
  notes: string;
}

export const JUDGE_SYSTEM_PROMPT = `You are a strict grading assistant for a RAG (retrieval-augmented generation) system. You will be given:
- a user question
- the system's answer
- the ground-truth source document text the answer should be grounded in
- a list of facts the answer is expected to mention

Grade the answer against ONLY the ground-truth text provided (not your own outside knowledge). Score:
1. "groundedness": integer 1-5. 5 = every factual claim in the answer is directly supported by the ground-truth text (or explicitly flagged as inference/general knowledge, per the answer's own wording). 1 = the answer states things as fact that contradict or are absent from the ground-truth text (hallucination).
2. "citationValid": true if the answer includes bracketed citation markers like [1], [2] for its factual claims (do not check the numbers against anything, just that citation markers are present and used near factual claims); false if factual claims appear with no citation markers at all.
3. "mentionsCovered": true if the answer's substance addresses every item in the expected-mentions list (paraphrase is fine, exact wording is not required); false otherwise.
4. "notes": one short sentence explaining the groundedness score.

Respond with ONLY a JSON object, no markdown fences, no extra text, in exactly this shape:
{"groundedness": <1-5>, "citationValid": <bool>, "mentionsCovered": <bool>, "notes": "<string>"}`;

export function buildJudgeUserPrompt(input: JudgeInput): string {
  return `## Question
${input.question}

## System answer
${input.answer}

## Ground-truth source text
${input.groundTruthText}

## Expected mentions (paraphrase OK)
${input.mustMention.length > 0 ? input.mustMention.map((m) => `- ${m}`).join('\n') : '(none specified)'}`;
}
