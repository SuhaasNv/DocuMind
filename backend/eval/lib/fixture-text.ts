import type { PdfPage } from './make-pdf';

/** Flatten a fixture's pages back to plain text — used as judge ground truth. */
export function fixtureText(fixture: { pages: PdfPage[] }): string {
  return fixture.pages.map((page) => page.join('\n')).join('\n\n');
}
