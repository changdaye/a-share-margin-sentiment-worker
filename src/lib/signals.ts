import { percentileRank } from './percentile';
import type { AlertState, MarketDailySnapshot, MarketSignal, SentimentLevel } from '../types';

function sumLast(values: number[], count: number): number {
  return values.slice(-count).reduce((sum, item) => sum + item, 0);
}

export function buildSignal(current: MarketDailySnapshot, history: MarketDailySnapshot[]): MarketSignal {
  const financingBalances = history.map((row) => row.financingBalance);
  const netBuys = history.map((row) => row.financingNetBuy);
  const lendingBalances = history.map((row) => row.securitiesLendingBalance);
  const marketVolumes = history
    .map((row) => row.marketVolumeShares)
    .filter((value): value is number => typeof value === 'number');
  const rolling5 = history.map((_, index, rows) => sumLast(rows.slice(0, index + 1).map((row) => row.financingNetBuy), 5));
  const last5NetBuy = sumLast(netBuys, 5);
  const last10NetBuy = sumLast(netBuys, 10);
  const financingBalancePct250 = percentileRank(financingBalances, current.financingBalance);
  const financingNetBuy1dPct250 = percentileRank(netBuys, current.financingNetBuy);
  const financingNetBuy5dPct250 = percentileRank(rolling5, last5NetBuy);
  const lendingBalancePct250 = percentileRank(lendingBalances, current.securitiesLendingBalance);
  const marketVolumePct250 = typeof current.marketVolumeShares === 'number' && marketVolumes.length > 0
    ? percentileRank(marketVolumes, current.marketVolumeShares)
    : undefined;

  let sentimentLevel: SentimentLevel = 'neutral';
  if (financingBalancePct250 >= 95 || financingNetBuy5dPct250 >= 90) sentimentLevel = 'hot';
  else if (financingBalancePct250 >= 75 || financingNetBuy5dPct250 >= 75) sentimentLevel = 'warm';
  else if (financingBalancePct250 <= 10 || financingNetBuy5dPct250 <= 10) sentimentLevel = 'cold';
  else if (financingBalancePct250 <= 25 || financingNetBuy5dPct250 <= 25) sentimentLevel = 'cool';

  let alertState: AlertState = 'none';
  if (financingBalancePct250 >= 95 && financingNetBuy5dPct250 >= 90) alertState = 'overheat';
  else if (financingNetBuy5dPct250 <= 10 && last5NetBuy < 0) alertState = 'cooling';

  return {
    tradeDate: current.tradeDate,
    financingBalancePct250,
    financingNetBuy1dPct250,
    financingNetBuy5d: Number(last5NetBuy.toFixed(2)),
    financingNetBuy5dPct250,
    financingNetBuy10d: Number(last10NetBuy.toFixed(2)),
    lendingBalancePct250,
    marketVolumePct250,
    sentimentLevel,
    alertState,
    summaryText: '',
    metricsJson: JSON.stringify({
      financingBalance: current.financingBalance,
      financingNetBuy: current.financingNetBuy,
      securitiesLendingBalance: current.securitiesLendingBalance,
      marketVolumeShares: current.marketVolumeShares,
    }),
  };
}
