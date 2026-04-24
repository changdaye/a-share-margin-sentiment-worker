import { describe, expect, it } from 'vitest';
import { parseSzseSummary } from '../src/services/exchange-szse';

describe('parseSzseSummary', () => {
  it('builds a source snapshot with derived totals', () => {
    const result = parseSzseSummary({ tradeDate: '2026-04-24', financingBalance: 80, securitiesLendingBalance: 2, financingBuy: 8, financingRepay: 6 });
    expect(result.sourceName).toBe('szse');
    expect(result.marginBalanceTotal).toBe(82);
    expect(result.financingNetBuy).toBe(2);
  });
});
