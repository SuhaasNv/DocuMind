import type { PdfPage } from '../lib/make-pdf';

/**
 * Fixture: an internal project status report. Facts are planted far apart
 * (different pages) so hybrid retrieval has to actually find the right
 * chunk rather than always returning page 1. Filler paragraphs pad each
 * page to real chunk-worthy length (chunking.ts targets ~400 tokens/chunk).
 */

const FILLER = [
  'The steering committee meets biweekly to review cross-team dependencies and unblock engineering work before it becomes a schedule risk.',
  'Documentation for internal tooling is maintained in the wiki, and every service owner is expected to keep the runbook current for on-call rotations.',
  'Vendor contracts are renewed annually, and procurement flags any renewal that exceeds the prior year budget by more than five percent for review.',
  'The design system team ships a new component release each sprint, and downstream teams pick up updates during their normal dependency bump cycle.',
  'Incident postmortems are blameless and are published internally within five business days of resolution, with action items tracked to closure.',
  'The data platform team runs nightly batch jobs that reconcile analytics warehouse tables against the production database for drift detection.',
];

function fillerParagraphs(count: number, seed: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => FILLER[(seed + i) % FILLER.length],
  );
}

const pages: PdfPage[] = [
  // Page 1: intro + filler (no target facts)
  ['AURORA Program — Quarterly Status Report', ...fillerParagraphs(4, 0)],
  // Page 2: filler
  fillerParagraphs(5, 1),
  // Page 3: codename + launch date fact, buried among filler
  [
    ...fillerParagraphs(2, 2),
    'The secret project codename is AURORA-7, and it is scheduled to launch in June 2027 pending final security review.',
    ...fillerParagraphs(2, 4),
  ],
  // Page 4: filler
  fillerParagraphs(5, 3),
  // Page 5: engineering lead fact, buried among filler
  [
    ...fillerParagraphs(2, 0),
    'The engineering lead for AURORA-7 is Priya Chen, who previously ran the platform reliability team for three years.',
    ...fillerParagraphs(2, 5),
  ],
  // Page 6: filler
  fillerParagraphs(5, 2),
  // Page 7: budget fact, buried among filler
  [
    ...fillerParagraphs(2, 1),
    'The approved budget for AURORA-7 is 8.4 million dollars for the current fiscal year, covering headcount, cloud infrastructure, and third-party audits.',
    ...fillerParagraphs(2, 3),
  ],
  // Page 8: closing filler
  fillerParagraphs(4, 4),
];

export const auroraProjectFixture = {
  name: 'aurora-project.pdf',
  pages,
};
