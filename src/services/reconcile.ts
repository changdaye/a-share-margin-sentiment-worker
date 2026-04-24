import type { MarketDailySnapshot, SourceSnapshot } from '../types';

interface EastmoneyBreakdown {
  sh?: {
    financingBalance: number;
    securitiesLendingBalance: number;
    financingBuy: number;
    financingRepay: number;
    lendingSell?: number;
  };
  sz?: {
    financingBalance: number;
    securitiesLendingBalance: number;
    financingBuy: number;
    financingRepay: number;
    lendingSell?: number;
  };
}

function getEastmoneyBreakdown(snapshot?: SourceSnapshot): EastmoneyBreakdown | undefined {
  return snapshot?.rawPayload && typeof snapshot.rawPayload === 'object'
    ? (snapshot.rawPayload as { breakdown?: EastmoneyBreakdown }).breakdown
    : undefined;
}

export function reconcileSnapshots(input: {
  sse?: SourceSnapshot;
  szse?: SourceSnapshot;
  eastmoney?: SourceSnapshot;
}): MarketDailySnapshot {
  const { sse, szse, eastmoney } = input;
  const breakdown = getEastmoneyBreakdown(eastmoney);
  const sh = sse ?? (breakdown?.sh
    ? {
        tradeDate: eastmoney!.tradeDate,
        sourceName: 'eastmoney' as const,
        financingBalance: breakdown.sh.financingBalance,
        securitiesLendingBalance: breakdown.sh.securitiesLendingBalance,
        marginBalanceTotal: breakdown.sh.financingBalance + breakdown.sh.securitiesLendingBalance,
        financingBuy: breakdown.sh.financingBuy,
        financingRepay: breakdown.sh.financingRepay,
        financingNetBuy: breakdown.sh.financingBuy - breakdown.sh.financingRepay,
        lendingSell: breakdown.sh.lendingSell,
        rawPayload: breakdown.sh,
      }
    : undefined);
  const sz = szse ?? (breakdown?.sz
    ? {
        tradeDate: eastmoney!.tradeDate,
        sourceName: 'eastmoney' as const,
        financingBalance: breakdown.sz.financingBalance,
        securitiesLendingBalance: breakdown.sz.securitiesLendingBalance,
        marginBalanceTotal: breakdown.sz.financingBalance + breakdown.sz.securitiesLendingBalance,
        financingBuy: breakdown.sz.financingBuy,
        financingRepay: breakdown.sz.financingRepay,
        financingNetBuy: breakdown.sz.financingBuy - breakdown.sz.financingRepay,
        lendingSell: breakdown.sz.lendingSell,
        rawPayload: breakdown.sz,
      }
    : undefined);

  if (!sh && !sz && !eastmoney) {
    throw new Error('no source snapshots available');
  }

  if (!sh && !sz && eastmoney) {
    return {
      tradeDate: eastmoney.tradeDate,
      sourceStrategy: 'fallback_eastmoney',
      sseAvailable: false,
      szseAvailable: false,
      eastmoneyUsed: true,
      financingBalance: eastmoney.financingBalance ?? 0,
      securitiesLendingBalance: eastmoney.securitiesLendingBalance ?? 0,
      marginBalanceTotal: eastmoney.marginBalanceTotal ?? 0,
      financingBuy: eastmoney.financingBuy ?? 0,
      financingRepay: eastmoney.financingRepay ?? 0,
      financingNetBuy: eastmoney.financingNetBuy ?? 0,
      lendingSell: eastmoney.lendingSell,
      lendingRepay: eastmoney.lendingRepay,
      lendingNetSell: eastmoney.lendingNetSell,
      rawPayloadJson: JSON.stringify({ eastmoney: eastmoney.rawPayload }),
    };
  }

  const financingBalance = (sh?.financingBalance ?? 0) + (sz?.financingBalance ?? 0);
  const securitiesLendingBalance = (sh?.securitiesLendingBalance ?? 0) + (sz?.securitiesLendingBalance ?? 0);
  const marginBalanceTotal = (sh?.marginBalanceTotal ?? 0) + (sz?.marginBalanceTotal ?? 0);
  const financingBuy = (sh?.financingBuy ?? 0) + (sz?.financingBuy ?? 0);
  const financingRepay = (sh?.financingRepay ?? 0) + (sz?.financingRepay ?? 0);
  const financingNetBuy = (sh?.financingNetBuy ?? 0) + (sz?.financingNetBuy ?? 0);
  const lendingSell = ((sh?.lendingSell ?? 0) + (sz?.lendingSell ?? 0)) || undefined;
  const lendingRepay = ((sh?.lendingRepay ?? 0) + (sz?.lendingRepay ?? 0)) || undefined;
  const lendingNetSell = ((sh?.lendingNetSell ?? 0) + (sz?.lendingNetSell ?? 0)) || undefined;
  const sourceStrategy = sse && szse ? 'official' : 'mixed';

  return {
    tradeDate: sh?.tradeDate ?? sz?.tradeDate ?? eastmoney?.tradeDate ?? '',
    sourceStrategy,
    sseAvailable: Boolean(sse),
    szseAvailable: Boolean(szse),
    eastmoneyUsed: Boolean(eastmoney) && (!sse || !szse),
    financingBalance,
    securitiesLendingBalance,
    marginBalanceTotal,
    financingBuy,
    financingRepay,
    financingNetBuy,
    lendingSell,
    lendingRepay,
    lendingNetSell,
    rawPayloadJson: JSON.stringify({ sse: sse?.rawPayload ?? null, szse: szse?.rawPayload ?? null, eastmoney: eastmoney?.rawPayload ?? null }),
  };
}
