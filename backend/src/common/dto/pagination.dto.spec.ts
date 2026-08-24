import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationDto } from './pagination.dto';

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
