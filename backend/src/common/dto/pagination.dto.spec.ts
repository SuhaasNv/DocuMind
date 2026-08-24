import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PagePaginationDto, PaginationDto } from './pagination.dto';

async function errorsFor(query: Record<string, unknown>): Promise<number> {
  const dto = plainToInstance(PaginationDto, query);
  const errors = await validate(dto);
  return errors.length;
}

describe('PaginationDto', () => {
  it('defaults take=24, skip=0 when absent', async () => {
    const dto = plainToInstance(PaginationDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.take).toBe(24);
    expect(dto.skip).toBe(0);
  });

  it('accepts valid string values (query params)', async () => {
    const dto = plainToInstance(PaginationDto, { take: '50', skip: '24' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.take).toBe(50);
    expect(dto.skip).toBe(24);
  });

  it('rejects take above the cap of 50', async () => {
    expect(await errorsFor({ take: '51' })).toBeGreaterThan(0);
    expect(await errorsFor({ take: '9999' })).toBeGreaterThan(0);
  });

  it('rejects take below 1 and negative skip', async () => {
    expect(await errorsFor({ take: '0' })).toBeGreaterThan(0);
    expect(await errorsFor({ take: '-5' })).toBeGreaterThan(0);
    expect(await errorsFor({ skip: '-1' })).toBeGreaterThan(0);
  });

  it('rejects non-numeric and non-integer garbage', async () => {
    expect(await errorsFor({ take: 'abc' })).toBeGreaterThan(0);
    expect(await errorsFor({ skip: 'DROP TABLE' })).toBeGreaterThan(0);
    expect(await errorsFor({ take: '2.5' })).toBeGreaterThan(0);
  });

  it('rejects huge skip', async () => {
    expect(await errorsFor({ skip: '99999999999' })).toBeGreaterThan(0);
  });
});

describe('PagePaginationDto (admin lists)', () => {
  async function pageErrorsFor(
    query: Record<string, unknown>,
  ): Promise<number> {
    const dto = plainToInstance(PagePaginationDto, query);
    return (await validate(dto)).length;
  }

  it('defaults page=1, limit=20 when absent', async () => {
    const dto = plainToInstance(PagePaginationDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('accepts valid string values and caps limit at 100', async () => {
    const dto = plainToInstance(PagePaginationDto, { page: '3', limit: '100' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(100);
    expect(await pageErrorsFor({ limit: '101' })).toBeGreaterThan(0);
    expect(await pageErrorsFor({ limit: '9999' })).toBeGreaterThan(0);
  });

  it('rejects page below 1 and non-numeric garbage', async () => {
    expect(await pageErrorsFor({ page: '0' })).toBeGreaterThan(0);
    expect(await pageErrorsFor({ page: '-2' })).toBeGreaterThan(0);
    expect(await pageErrorsFor({ page: 'abc' })).toBeGreaterThan(0);
    expect(await pageErrorsFor({ limit: 'DROP TABLE' })).toBeGreaterThan(0);
    expect(await pageErrorsFor({ limit: '2.5' })).toBeGreaterThan(0);
  });
});
