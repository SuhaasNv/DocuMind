import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Shared list pagination: take 1-50 (default 24), skip >= 0 (default 0).
 * Garbage input (negative, huge, non-numeric) fails validation with a 400.
 */
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  take?: number = 24;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  skip?: number = 0;
}

/**
 * Page-based pagination for the admin console (its API/frontend speak
 * page/limit, not take/skip): page >= 1 (default 1), limit 1-100
 * (default 20). Non-numeric input fails validation with a 400.
 */
export class PagePaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
