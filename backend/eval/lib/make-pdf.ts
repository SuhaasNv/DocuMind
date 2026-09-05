/**
 * Minimal multi-page PDF writer for eval fixtures (no deps).
 *
 * Unlike scripts/smoke.ts's makePdf (which repeats rotating filler lines),
 * this takes exact per-page paragraphs so fixture facts are deterministic
 * and gradeable — retrieval/answer eval cases assert against known text.
 */

/** One page = an ordered list of lines rendered top to bottom. */
export type PdfPage = string[];

const LINE_HEIGHT = 14;
const TOP_MARGIN = 780;
const CHARS_PER_LINE = 95;

function escapePdfString(s: string): string {
  return s.replace(/[\\()]/g, (c) => `\\${c}`);
}

/** Word-wrap a paragraph to a fixed column width so long fixture prose fits the page. */
function wrap(line: string, width = CHARS_PER_LINE): string[] {
  if (line.length <= width) return [line];
  const words = line.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur.length > 0 && cur.length + 1 + w.length > width) {
      out.push(cur);
      cur = w;
    } else {
      cur = cur.length === 0 ? w : `${cur} ${w}`;
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/**
 * Build a PDF (returned as a Buffer, ready to upload) from pages of raw
 * paragraph strings. Each paragraph is word-wrapped and rendered as its own
 * run of lines; a blank line separates paragraphs within a page.
 */
export function makeFixturePdf(pages: PdfPage[]): Buffer {
  const objs: string[] = [];
  const pageObjNums: number[] = [];
  // obj 1: catalog, obj 2: pages, obj 3: font; pages start at 4
  let next = 4;
  const contentRefs: Array<{ page: number; content: number }> = [];
  for (let p = 0; p < pages.length; p++) {
    contentRefs.push({ page: next, content: next + 1 });
    pageObjNums.push(next);
    next += 2;
  }
  objs[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objs[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums
    .map((n) => `${n} 0 R`)
    .join(' ')}] /Count ${pages.length} >>\nendobj\n`;
  objs[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

  for (let p = 0; p < pages.length; p++) {
    const { page, content } = contentRefs[p];
    const renderedLines: string[] = [];
    for (const paragraph of pages[p]) {
      for (const wrapped of wrap(paragraph)) {
        renderedLines.push(escapePdfString(wrapped));
      }
      renderedLines.push(''); // blank line between paragraphs
    }
    const stream =
      `BT /F1 10 Tf 40 ${TOP_MARGIN} Td ${LINE_HEIGHT} TL\n` +
      renderedLines.map((ln) => `(${ln}) Tj T*`).join('\n') +
      `\nET`;
    objs[page] =
      `${page} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>\nendobj\n`;
    objs[content] =
      `${content} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
  }

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < next; i++) {
    offsets[i] = Buffer.byteLength(body);
    body += objs[i];
  }
  const xrefStart = Buffer.byteLength(body);
  let xref = `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let i = 1; i < next; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `${xref}trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
