import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { InsightQueryDto } from './dto/insight-query.dto.js';

const validate = (input: Record<string, unknown>) =>
  validateSync(plainToInstance(InsightQueryDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('InsightQueryDto bounds', () => {
  it('accepts an empty query object with defaults', () => {
    const dto = plainToInstance(InsightQueryDto, {});
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('accepts valid filters and pagination', () => {
    expect(
      validate({
        query: 'aurora',
        tag: 'launch',
        documentId: 'doc',
        page: '2',
        limit: '50',
      }),
    ).toHaveLength(0);
  });

  it('rejects query over 200 chars', () => {
    expect(validate({ query: 'x'.repeat(201) }).length).toBeGreaterThan(0);
  });

  it('rejects tag over 40 chars', () => {
    expect(validate({ tag: 'x'.repeat(41) }).length).toBeGreaterThan(0);
  });

  it('rejects page < 1 and non-integer page', () => {
    expect(validate({ page: '0' }).length).toBeGreaterThan(0);
    expect(validate({ page: 'abc' }).length).toBeGreaterThan(0);
  });

  it('rejects limit outside 1..50', () => {
    expect(validate({ limit: '0' }).length).toBeGreaterThan(0);
    expect(validate({ limit: '51' }).length).toBeGreaterThan(0);
  });

  it('rejects unknown fields (mass-assignment safety)', () => {
    expect(validate({ userId: 'someone-else' }).length).toBeGreaterThan(0);
  });
});
