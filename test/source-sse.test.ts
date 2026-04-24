import { describe, expect, it } from 'vitest';
import { parseSseSummary } from '../src/services/exchange-sse';

describe('parseSseSummary', () => {
  it('builds a source snapshot with derived totals', () => {
    const result = parseSseSummary({ tradeDate: '2026-04-24', financingBalance: 100, securitiesLendingBalance: 3, financingBuy: 9, financingRepay: 7 });
    expect(result.sourceName).toBe('sse');
    expect(result.marginBalanceTotal).toBe(103);
    expect(result.financingNetBuy).toBe(2);
  });
});
