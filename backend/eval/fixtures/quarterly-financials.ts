import type { PdfPage } from '../lib/make-pdf';

/**
 * Fixture: a quarterly financial summary. Facts are planted far apart
 * (different pages), same rationale as aurora-project.ts.
 */

const FILLER = [
  'The finance team closes the books on the fifth business day of each month and circulates a variance report to department heads.',
  'Travel and expense policy requires manager approval above five hundred dollars, and all receipts must be submitted within thirty days.',
  'The audit committee reviews internal controls twice a year, with findings tracked in the compliance system until remediated.',
  'Foreign exchange exposure is hedged quarterly for the three currencies that make up the largest share of international revenue.',
  'The billing system reconciles subscription invoices against the contracts database nightly and flags mismatches for manual review.',
  'Board materials are distributed one week before each quarterly meeting, giving directors time to review ahead of discussion.',
];

function fillerParagraphs(count: number, seed: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => FILLER[(seed + i) % FILLER.length],
  );
}

const pages: PdfPage[] = [
  // Page 1: intro + filler
  ['Q3 Financial Summary — Board Briefing', ...fillerParagraphs(4, 0)],
  // Page 2: filler
  fillerParagraphs(5, 1),
  // Page 3: revenue growth fact, buried among filler
  [
    ...fillerParagraphs(2, 2),
    'Quarterly revenue grew by twelve percent year over year, reaching 4.2 million dollars, driven mainly by expansion within existing accounts.',
    ...fillerParagraphs(2, 4),
  ],
  // Page 4: filler
  fillerParagraphs(5, 3),
  // Page 5: headcount fact, buried among filler
  [
    ...fillerParagraphs(2, 0),
    'Headcount grew from 140 to 168 employees during the quarter, with the largest increase in the customer success organization.',
    ...fillerParagraphs(2, 5),
  ],
  // Page 6: filler
  fillerParagraphs(5, 2),
  // Page 7: churn fact, buried among filler
  [
    ...fillerParagraphs(2, 1),
    'Customer churn dropped to 2.1 percent this quarter, down from 3.4 percent last quarter, attributed to the new onboarding program.',
    ...fillerParagraphs(2, 3),
  ],
  // Page 8: closing filler
  fillerParagraphs(4, 4),
];

export const quarterlyFinancialsFixture = {
  name: 'quarterly-financials.pdf',
  pages,
};
