import { Logger } from '@nestjs/common';

const RAG_LATENCY = 'RagLatency';
const isDev = process.env.NODE_ENV !== 'production';

export interface RagLatencyTimings {
  retrievalMs: number;
  promptBuildMs: number;
  llmFirstTokenMs?: number;
}

/**
 * Log RAG pipeline timings in dev only. No-op in production.
 * Use to verify TTFT and pipeline improvements.
 */
export function logRagLatency(timings: RagLatencyTimings): void {
  if (!isDev) return;
  const logger = new Logger(RAG_LATENCY);
  const ttft =
    timings.llmFirstTokenMs != null
      ? timings.retrievalMs + timings.promptBuildMs + timings.llmFirstTokenMs
      : null;
  logger.log(
    `retrieval=${timings.retrievalMs}ms promptBuild=${timings.promptBuildMs}ms` +
      (timings.llmFirstTokenMs != null
        ? ` llmFirstToken=${timings.llmFirstTokenMs}ms`
        : '') +
      (ttft != null ? ` ttft=${ttft}ms` : ''),
  );
}
