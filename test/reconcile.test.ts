import { describe, expect, it } from 'vitest';
import { reconcileSnapshots } from '../src/services/reconcile';
import type { SourceSnapshot } from '../src/types';

describe('reconcileSnapshots', () => {
  it('prefers official totals when eastmoney disagrees', () => {
    const sse: SourceSnapshot = {
      tradeDate: '2026-04-24',
      sourceName: 'sse',
      financingBalance: 100,
      securitiesLendingBalance: 3,
      marginBalanceTotal: 103,
      financingBuy: 9,
      financingRepay: 7,
      financingNetBuy: 2,
      rawPayload: { sse: true },
    };
    const szse: SourceSnapshot = {
      tradeDate: '2026-04-24',
      sourceName: 'szse',
      financingBalance: 80,
      securitiesLendingBalance: 2,
      marginBalanceTotal: 82,
      financingBuy: 8,
      financingRepay: 6,
      financingNetBuy: 2,
      rawPayload: { szse: true },
    };
    const eastmoney: SourceSnapshot = {
      tradeDate: '2026-04-24',
      sourceName: 'eastmoney',
      financingBalance: 999,
      securitiesLendingBalance: 999,
      marginBalanceTotal: 1998,
      financingBuy: 50,
      financingRepay: 50,
      financingNetBuy: 0,
      rawPayload: { eastmoney: true },
    };

    const result = reconcileSnapshots({ sse, szse, eastmoney });
    expect(result.financingBalance).toBe(180);
    expect(result.securitiesLendingBalance).toBe(5);
    expect(result.sourceStrategy).toBe('official');
  });

  it('fills a missing exchange from eastmoney breakdown when one official source is unavailable', () => {
    const sse: SourceSnapshot = {
      tradeDate: '2026-04-24',
      sourceName: 'sse',
      financingBalance: 100,
      securitiesLendingBalance: 3,
      marginBalanceTotal: 103,
      financingBuy: 9,
      financingRepay: 7,
      financingNetBuy: 2,
      rawPayload: { sse: true },
    };
    const eastmoney: SourceSnapshot = {
      tradeDate: '2026-04-24',
      sourceName: 'eastmoney',
      financingBalance: 180,
      securitiesLendingBalance: 5,
      marginBalanceTotal: 185,
      financingBuy: 17,
      financingRepay: 13,
      financingNetBuy: 4,
      rawPayload: {
        breakdown: {
          sz: { financingBalance: 80, securitiesLendingBalance: 2, financingBuy: 8, financingRepay: 6 },
        },
      },
    };

    const result = reconcileSnapshots({ sse, eastmoney });
    expect(result.financingBalance).toBe(180);
    expect(result.financingNetBuy).toBe(4);
    expect(result.sourceStrategy).toBe('mixed');
    expect(result.eastmoneyUsed).toBe(true);
  });
});
