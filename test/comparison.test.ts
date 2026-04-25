import { describe, expect, it } from 'vitest';
import { buildComparisonNarrative, buildMetricComparisonRows } from '../src/lib/comparison';
import type { MarketDailySnapshot, MarketSignal } from '../src/types';

describe('comparison helpers', () => {
  it('computes historical median and current-month average rows for core metrics', () => {
    const historicalSnapshots: MarketDailySnapshot[] = [
      {
        tradeDate: '2026-04-01',
        sourceStrategy: 'mixed',
        sseAvailable: true,
        szseAvailable: false,
        eastmoneyUsed: true,
        financingBalance: 2500000000000,
        securitiesLendingBalance: 18000000000,
        marginBalanceTotal: 2518000000000,
        financingBuy: 180000000000,
        financingRepay: 175000000000,
        financingNetBuy: 5000000000,
        marketVolumeShares: 100000000000,
        rawPayloadJson: '{}',
      },
      {
        tradeDate: '2026-04-10',
        sourceStrategy: 'mixed',
        sseAvailable: true,
        szseAvailable: false,
        eastmoneyUsed: true,
        financingBalance: 2600000000000,
        securitiesLendingBalance: 19000000000,
        marginBalanceTotal: 2619000000000,
        financingBuy: 210000000000,
        financingRepay: 205000000000,
        financingNetBuy: 5000000000,
        marketVolumeShares: 110000000000,
        rawPayloadJson: '{}',
      },
      {
        tradeDate: '2026-04-15',
        sourceStrategy: 'mixed',
        sseAvailable: true,
        szseAvailable: false,
        eastmoneyUsed: true,
        financingBalance: 2650000000000,
        securitiesLendingBalance: 19500000000,
        marginBalanceTotal: 2669500000000,
        financingBuy: 220000000000,
        financingRepay: 212000000000,
        financingNetBuy: 8000000000,
        marketVolumeShares: 115000000000,
        rawPayloadJson: '{}',
      },
      {
        tradeDate: '2026-04-22',
        sourceStrategy: 'mixed',
        sseAvailable: true,
        szseAvailable: false,
        eastmoneyUsed: true,
        financingBalance: 2691968846032,
        securitiesLendingBalance: 20232731678,
        marginBalanceTotal: 2712201577710,
        financingBuy: 262586055248,
        financingRepay: 258598346154,
        financingNetBuy: 3987709094,
        marketVolumeShares: 120000000000,
        rawPayloadJson: '{}',
      },
    ];

    const currentSnapshot: MarketDailySnapshot = {
      tradeDate: '2026-04-23',
      sourceStrategy: 'mixed',
      sseAvailable: true,
      szseAvailable: false,
      eastmoneyUsed: true,
      financingBalance: 2695768367122,
      securitiesLendingBalance: 20044043633,
      marginBalanceTotal: 2715812410755,
      financingBuy: 282232708850,
      financingRepay: 267449439983,
      financingNetBuy: 14783268867,
      marketVolumeShares: 131393668700,
      rawPayloadJson: '{}',
    };

    const currentSignal: MarketSignal = {
      tradeDate: '2026-04-23',
      financingBalancePct250: 96,
      financingNetBuy1dPct250: 92,
      financingNetBuy5d: 41200000000,
      financingNetBuy5dPct250: 94,
      financingNetBuy10d: 63500000000,
      lendingBalancePct250: 50,
      marketVolumePct250: 82,
      sentimentLevel: 'hot',
      alertState: 'overheat',
      summaryText: '',
      metricsJson: '{}',
    };

    const rows = buildMetricComparisonRows({
      snapshot: currentSnapshot,
      signal: currentSignal,
      historicalSnapshots,
      previousSnapshot: historicalSnapshots[historicalSnapshots.length - 1],
    });

    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      label: '融资余额',
      currentText: '26957.68亿元',
      previousText: '26919.69亿元',
      previousChangeText: '增加 0.14%',
      medianText: '26250.00亿元',
      medianChangeText: '增加 2.70%',
      monthAverageText: '26275.47亿元',
      monthAverageChangeText: '增加 2.60%',
    });
    expect(rows[3]).toMatchObject({
      label: 'A股成交量',
      currentText: '1313.94亿股',
      previousText: '1200.00亿股',
      previousChangeText: '增加 9.49%',
      medianText: '1125.00亿股',
      medianChangeText: '增加 16.79%',
      monthAverageText: '1152.79亿股',
      monthAverageChangeText: '增加 13.98%',
    });
  });

  it('builds a clearer narrative with current values, baselines, and explicit deltas', () => {
    const narrative = buildComparisonNarrative([
      {
        label: '融资余额',
        currentText: '26957.68亿元',
        previousText: '26919.69亿元',
        previousChangeText: '增加 0.14%',
        medianText: '26250.00亿元',
        medianChangeText: '增加 2.70%',
        monthAverageText: '26275.47亿元',
        monthAverageChangeText: '增加 2.60%',
      },
      {
        label: '当日融资净买入',
        currentText: '147.83亿元',
        previousText: '39.88亿元',
        previousChangeText: '增加 270.72%',
        medianText: '50.00亿元',
        medianChangeText: '增加 195.67%',
        monthAverageText: '69.62亿元',
        monthAverageChangeText: '增加 112.35%',
      },
      {
        label: 'A股成交量',
        currentText: '1313.94亿股',
        previousText: '1200.00亿股',
        previousChangeText: '增加 9.49%',
        medianText: '1125.00亿股',
        medianChangeText: '增加 16.79%',
        monthAverageText: '1152.79亿股',
        monthAverageChangeText: '增加 13.98%',
      },
    ]);

    expect(narrative).toContain('🟥 融资余额 26957.68亿元｜昨 ↗ 0.14%｜中位数 ↗ 2.70%｜本月均值 ↗ 2.60%');
    expect(narrative).toContain('🟥 当日融资净买入 147.83亿元｜昨 ↗ 270.72%｜中位数 ↗ 195.67%｜本月均值 ↗ 112.35%');
    expect(narrative).toContain('🟥 A股成交量 1313.94亿股｜昨 ↗ 9.49%｜中位数 ↗ 16.79%｜本月均值 ↗ 13.98%');
  });
});
