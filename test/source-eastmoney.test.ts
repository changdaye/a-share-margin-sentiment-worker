import { describe, expect, it } from 'vitest';
import { parseEastmoneySummary } from '../src/services/eastmoney';

describe('parseEastmoneySummary', () => {
  it('builds a source snapshot with derived totals', () => {
    const result = parseEastmoneySummary({ tradeDate: '2026-04-24', financingBalance: 180, securitiesLendingBalance: 5, financingBuy: 17, financingRepay: 13 });
    expect(result.sourceName).toBe('eastmoney');
    expect(result.marginBalanceTotal).toBe(185);
    expect(result.financingNetBuy).toBe(4);
  });
});
