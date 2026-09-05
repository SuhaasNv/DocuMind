import { randomUUID } from 'node:crypto';
import { EvalApiClient } from './api-client';
import { makeFixturePdf, type PdfPage } from './make-pdf';

export interface FixtureDef {
  name: string;
  pages: PdfPage[];
}

export interface EvalSession {
  client: EvalApiClient;
  token: string;
  /** fixture name → uploaded, DONE document id */
  documentIds: Map<string, string>;
}

/**
 * Log in a fresh eval user and upload each distinct fixture (by name) once,
 * waiting for ingestion to reach DONE before returning. Run scripts call
 * this once at startup, then look up document ids per case by fixture name.
 */
export async function setupEvalSession(
  baseUrl: string,
  fixtures: FixtureDef[],
): Promise<EvalSession> {
  const client = new EvalApiClient(baseUrl);
  const email = `eval-${randomUUID()}@example.com`;
  const auth = await client.registerOrLogin(
    email,
    'Eval Harness',
    'eval-harness-pw-1!',
  );
  const token = auth.accessToken;

  const seen = new Map<string, FixtureDef>();
  for (const f of fixtures) seen.set(f.name, f);

  const documentIds = new Map<string, string>();
  for (const fixture of seen.values()) {
    const pdf = makeFixturePdf(fixture.pages);
    const doc = await client.uploadPdf(token, fixture.name, pdf);
    await client.waitForDone(token, doc.id);
    documentIds.set(fixture.name, doc.id);
  }

  return { client, token, documentIds };
}
