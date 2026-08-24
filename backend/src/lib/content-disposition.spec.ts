import { buildContentDisposition } from './content-disposition';

describe('buildContentDisposition', () => {
  it('quotes a plain name unchanged', () => {
    const header = buildContentDisposition('Quarterly Report.pdf');
    expect(header).toBe(
      `attachment; filename="Quarterly Report.pdf"; filename*=UTF-8''Quarterly%20Report.pdf`,
    );
  });

  it('strips CRLF and quotes from a malicious name (header injection)', () => {
    const malicious = 'evil\r\nSet-Cookie: session=hijacked\r\n"; foo.pdf';
    const header = buildContentDisposition(malicious);

    // No raw CR/LF/quote may reach the header value at all.
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.split('filename="')[1]).not.toContain('"; foo');
    // Sanity: header still parses as a single well-formed attachment directive.
    expect(header.startsWith('attachment; filename="')).toBe(true);
  });

  it('strips semicolons and path separators', () => {
    const header = buildContentDisposition('../../etc/passwd; rm -rf');
    expect(header).not.toContain('/');
    expect(header).not.toContain('\\');
    // The one semicolon left is the directive separator we generate ourselves.
    expect(header.match(/;/g)?.length).toBe(2);
  });

  it('falls back to "document" when nothing but forbidden chars remain', () => {
    const header = buildContentDisposition('\r\n";');
    expect(header).toBe(
      `attachment; filename="document.pdf"; filename*=UTF-8''document.pdf`,
    );
  });

  it('does not duplicate a trailing .pdf extension', () => {
    const header = buildContentDisposition('report.pdf');
    expect(header).toContain('filename="report.pdf"');
    expect(header).not.toContain('report.pdf.pdf');
  });

  it('provides a UTF-8 percent-encoded fallback for non-ASCII names', () => {
    const header = buildContentDisposition('résumé café.pdf');
    expect(header).toContain(
      `filename*=UTF-8''${encodeURIComponent('résumé café.pdf')}`,
    );
    // ASCII filename replaces non-ASCII chars rather than dropping the header.
    expect(header).toMatch(/filename="[\x20-\x7E]+\.pdf"/);
  });
});
