import { auroraProjectFixture } from '../fixtures/aurora-project';
import { quarterlyFinancialsFixture } from '../fixtures/quarterly-financials';

export interface RetrievalCase {
  id: string;
  fixture: { name: string; pages: string[][] };
  query: string;
  /** Retrieval passes for this case if any top-K chunk contains this (case-insensitive). */
  expectedSubstring: string;
  topK: number;
}

export const retrievalCases: RetrievalCase[] = [
  {
    id: 'aurora-codename',
    fixture: auroraProjectFixture,
    query: 'What is the secret project codename and when does it launch?',
    expectedSubstring: 'AURORA-7',
    topK: 5,
  },
  {
    id: 'aurora-lead',
    fixture: auroraProjectFixture,
    query: 'Who is the engineering lead for the project?',
    expectedSubstring: 'Priya Chen',
    topK: 5,
  },
  {
    id: 'aurora-budget',
    fixture: auroraProjectFixture,
    query: 'What is the approved budget for this fiscal year?',
    expectedSubstring: '8.4 million',
    topK: 5,
  },
  {
    id: 'financials-revenue',
    fixture: quarterlyFinancialsFixture,
    query: 'How much did revenue grow this quarter?',
    expectedSubstring: 'twelve percent',
    topK: 5,
  },
  {
    id: 'financials-headcount',
    fixture: quarterlyFinancialsFixture,
    query: 'How did headcount change this quarter?',
    expectedSubstring: '140 to 168',
    topK: 5,
  },
  {
    id: 'financials-churn',
    fixture: quarterlyFinancialsFixture,
    query: 'What happened to customer churn this quarter?',
    expectedSubstring: '2.1 percent',
    topK: 5,
  },
];
