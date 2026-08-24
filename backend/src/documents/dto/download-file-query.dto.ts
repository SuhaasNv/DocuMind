import { IsIn, IsOptional } from 'class-validator';

/**
 * GET :id/file query params. `download` is a plain string flag (not a
 * coerced boolean) — the only accepted value is "1"; anything else fails
 * validation with a 400 rather than being silently ignored.
 */
export class DownloadFileQueryDto {
  @IsOptional()
  @IsIn(['1'])
  download?: string;
}
