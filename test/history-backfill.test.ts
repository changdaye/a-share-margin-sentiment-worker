import { describe, expect, it } from 'vitest';
import { attachMarketVolumeToSnapshot, buildHistoricalSignals, buildHistoricalSnapshotFromEastmoneyRow, hydrateHistoricalFinancingFlows, shouldBootstrapHistory } from '../src/services/history-backfill';
import type { MarketDailySnapshot } from '../src/types';

describe('history backfill helpers', () => {
  it('builds a historical snapshot even when eastmoney total fields are null but both exchanges exist', () => {
    const snapshot = buildHistoricalSnapshotFromEastmoneyRow({
      DIM_DATE: '2020-12-10 00:00:00',
      H_RZYE: 755649047599,
      H_RQYE: 73912195189,
      H_RZMRE: 31291093912,
      H_RQMCL: 187002425,
      H_RZRQYE: 829561242788,
      H_RZRQYECZ: 681736852410,
      S_RZYE: 712951835175,
      S_RQYE: 41422940399,
      S_RZMRE: 27993938320,
      S_RQMCL: 56375072,
      S_RZRQYE: 754374775574,
      S_RZRQYECZ: 671528894776,
      TOTAL_RZYE: null,
      TOTAL_RQYE: null,
      TOTAL_RZMRE: null,
      TOTAL_RZRQYE: null,
      TOTAL_RZRQYECZ: null,
      B_RZYE: null,
      B_RQYE: null,
      B_RZMRE: null,
      B_RQMCL: null,
      B_RZRQYE: null,
      B_RZRQYECZ: null,
    });

    expect(snapshot).toMatchObject({
      tradeDate: '2020-12-10',
      sourceStrategy: 'fallback_eastmoney',
      financingBalance: 1468600882774,
      securitiesLendingBalance: 115335135588,
      marginBalanceTotal: 1583936018362,
      financingBuy: 59285032232,
    });
  });

  it('flags missing rows or volume gaps as needing bootstrap', () => {
    const row: MarketDailySnapshot = {
      tradeDate: '2026-04-24',
      sourceStrategy: 'official',
      sseAvailable: true,
      szseAvailable: true,
      eastmoneyUsed: false,
      financingBalance: 100,
      securitiesLendingBalance: 5,
      marginBalanceTotal: 105,
      financingBuy: 10,
      financingRepay: 8,
      financingNetBuy: 2,
      rawPayloadJson: '{}',
    };

    expect(shouldBootstrapHistory([], 250)).toBe(true);
    expect(shouldBootstrapHistory([row], 250)).toBe(true);
    expect(shouldBootstrapHistory([{ ...row, marketVolumeShares: 100000000 }], 1)).toBe(false);
  });

  it('attaches market volume and builds backfilled signals with the configured window', () => {
    const snapshots: MarketDailySnapshot[] = [
      {
        tradeDate: '2026-04-22',
        sourceStrategy: 'fallback_eastmoney',
        sseAvailable: false,
        szseAvailable: false,
        eastmoneyUsed: true,
        financingBalance: 100,
        securitiesLendingBalance: 5,
        marginBalanceTotal: 105,
        financingBuy: 10,
        financingRepay: 8,
        financingNetBuy: 2,
        rawPayloadJson: '{}',
      },
      {
        tradeDate: '2026-04-23',
        sourceStrategy: 'fallback_eastmoney',
        sseAvailable: false,
        szseAvailable: false,
        eastmoneyUsed: true,
        financingBalance: 120,
        securitiesLendingBalance: 5,
        marginBalanceTotal: 125,
        financingBuy: 15,
        financingRepay: 9,
        financingNetBuy: 6,
        rawPayloadJson: '{}',
      },
      {
        tradeDate: '2026-04-24',
        sourceStrategy: 'fallback_eastmoney',
        sseAvailable: false,
        szseAvailable: false,
        eastmoneyUsed: true,
        financingBalance: 130,
        securitiesLendingBalance: 5,
        marginBalanceTotal: 135,
        financingBuy: 18,
        financingRepay: 10,
        financingNetBuy: 8,
        rawPayloadJson: '{}',
      },
    ];

    const enriched = attachMarketVolumeToSnapshot(snapshots[2], {
      tradeDate: '2026-04-24',
      marketVolumeShares: 131393668700,
      rawPayload: { totalVolumeLots: 1313936687 },
    });
    expect(enriched.marketVolumeShares).toBe(131393668700);

    const signals = buildHistoricalSignals([
      { ...snapshots[0], marketVolumeShares: 100000000000 },
      { ...snapshots[1], marketVolumeShares: 120000000000 },
      enriched,
    ], 2);

    expect(signals).toHaveLength(3);
    expect(signals[2]?.marketVolumePct250).toBe(100);
    expect(signals[2]?.summaryText).toBe('');
  });

  it('rebuilds historical financing net buy from financing balance changes', () => {
    const hydrated = hydrateHistoricalFinancingFlows([
      {
        tradeDate: '2026-04-22',
        sourceStrategy: 'fallback_eastmoney',
        sseAvailable: false,
        szseAvailable: false,
        eastmoneyUsed: true,
        financingBalance: 100,
        securitiesLendingBalance: 5,
        marginBalanceTotal: 105,
        financingBuy: 10,
        financingRepay: 0,
        financingNetBuy: 0,
        rawPayloadJson: '{}',
      },
      {
        tradeDate: '2026-04-23',
        sourceStrategy: 'fallback_eastmoney',
        sseAvailable: false,
        szseAvailable: false,
        eastmoneyUsed: true,
        financingBalance: 106,
        securitiesLendingBalance: 5,
        marginBalanceTotal: 111,
        financingBuy: 12,
        financingRepay: 0,
        financingNetBuy: 0,
        rawPayloadJson: '{}',
      },
    ]);

    expect(hydrated[0]?.financingNetBuy).toBe(0);
    expect(hydrated[0]?.financingRepay).toBe(10);
    expect(hydrated[1]?.financingNetBuy).toBe(6);
    expect(hydrated[1]?.financingRepay).toBe(6);
  });
});
