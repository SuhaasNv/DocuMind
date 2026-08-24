import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';

const UPLOADS_DIR = 'uploads';
/** A file must be at least this old before it can be considered orphaned. */
export const ORPHAN_MAX_AGE_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export interface SweepFile {
  name: string;
  mtimeMs: number;
}

/**
 * Pure orphan decision: a file is deleted only when it is older than
 * `maxAgeMs` AND no known Document.filePath references its basename.
 * Recent files are always kept (an upload may not have its row yet).
 */
export function selectOrphans(
  files: SweepFile[],
  knownFilePaths: string[],
  now: number,
  maxAgeMs: number = ORPHAN_MAX_AGE_MS,
): string[] {
  return files
    .filter((f) => now - f.mtimeMs > maxAgeMs)
    .filter((f) => !knownFilePaths.some((p) => p.includes(f.name)))
    .map((f) => f.name);
}

/**
 * Correctness backstop for the uploads dir: a partial upload whose socket
 * died, or a Document delete whose unlink failed, leaves a file with no
 * Document row. Sweep on boot and hourly; delete files older than 1 hour
 * with no referencing row. Best-effort — a missing uploads dir or any
 * per-file error is logged and skipped, never a crash.
 */
@Injectable()
export class OrphanSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrphanSweepService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async sweep(): Promise<void> {
    const dir = path.join(process.cwd(), UPLOADS_DIR);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return; // no uploads dir yet — nothing to sweep
    }

    const now = Date.now();
    const files: SweepFile[] = [];
    for (const name of names) {
      try {
        const info = await stat(path.join(dir, name));
        if (info.isFile()) files.push({ name, mtimeMs: info.mtimeMs });
      } catch {
        // File vanished between readdir and stat — skip it.
      }
    }

    // Only old files can be orphans; look up references for just those.
    const candidates = files.filter((f) => now - f.mtimeMs > ORPHAN_MAX_AGE_MS);
    const knownFilePaths: string[] = [];
    for (const f of candidates) {
      try {
        const row = await this.prisma.document.findFirst({
          where: { filePath: { contains: f.name } },
          select: { filePath: true },
        });
        if (row?.filePath) knownFilePaths.push(row.filePath);
      } catch (err) {
        // DB hiccup: treat the file as referenced (never delete on doubt).
        knownFilePaths.push(f.name);
        this.logger.warn(
          `Orphan sweep lookup failed for ${f.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    for (const name of selectOrphans(files, knownFilePaths, now)) {
      try {
        await unlink(path.join(dir, name));
        this.logger.log(`Orphan sweep removed unreferenced upload ${name}`);
      } catch (err) {
        this.logger.warn(
          `Orphan sweep could not remove ${name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
