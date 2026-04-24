import { describe, expect, it } from 'vitest';
import { percentileRank } from '../src/lib/percentile';
import { buildSignal } from '../src/lib/signals';
import type { MarketDailySnapshot } from '../src/types';

describe('percentileRank', () => {
  it('returns 100 when value is the max in the sample', () => {
    expect(percentileRank([1, 2, 3, 4], 4)).toBe(100);
  });
});

describe('buildSignal', () => {
  it('marks hot + overheat when financing metrics are extreme', () => {
    const current: MarketDailySnapshot = {
      tradeDate: '2026-04-24',
      sourceStrategy: 'official',
      sseAvailable: true,
      szseAvailable: true,
      eastmoneyUsed: false,
      financingBalance: 210,
      securitiesLendingBalance: 5,
      marginBalanceTotal: 215,
      financingBuy: 25,
      financingRepay: 10,
      financingNetBuy: 15,
      rawPayloadJson: '{}',
    };

    const history = Array.from({ length: 250 }, (_, i) => ({
      tradeDate: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
      sourceStrategy: 'official' as const,
      sseAvailable: true,
      szseAvailable: true,
      eastmoneyUsed: false,
      financingBalance: 100 + i * 0.2,
      securitiesLendingBalance: 4,
      marginBalanceTotal: 104 + i * 0.2,
      financingBuy: 10,
      financingRepay: 9,
      financingNetBuy: 1,
      rawPayloadJson: '{}',
    }));

    const signal = buildSignal(current, [...history, current]);
    expect(signal.sentimentLevel).toBe('hot');
    expect(signal.alertState).toBe('overheat');
  });
});
