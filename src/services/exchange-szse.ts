import type { AppConfig, SourceSnapshot } from '../types';

export function parseSzseSummary(payload: { tradeDate: string; financingBalance: number; securitiesLendingBalance: number; financingBuy: number; financingRepay: number; lendingSell?: number; }): SourceSnapshot {
  return {
    tradeDate: payload.tradeDate,
    sourceName: 'szse',
    financingBalance: payload.financingBalance,
    securitiesLendingBalance: payload.securitiesLendingBalance,
    marginBalanceTotal: payload.financingBalance + payload.securitiesLendingBalance,
    financingBuy: payload.financingBuy,
    financingRepay: payload.financingRepay,
    financingNetBuy: payload.financingBuy - payload.financingRepay,
    lendingSell: payload.lendingSell,
    rawPayload: payload,
  };
}

export async function fetchSzseSummary(config: AppConfig): Promise<SourceSnapshot | undefined> {
  const response = await fetch('https://www.szse.cn/disclosure/margin/margin/index.html', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`szse HTTP ${response.status}`);

  const dateMatch = text.match(/数据日期[:：]\s*(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return undefined;
  return undefined;
}
