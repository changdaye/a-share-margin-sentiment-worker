import type { AppConfig, SourceSnapshot } from '../types';

interface EastmoneyRow {
  DIM_DATE: string;
  H_RZYE: number;
  H_RQYE: number;
  H_RZMRE: number;
  H_RZRQYE: number;
  H_RZRQYECZ?: number;
  H_RQMCL?: number;
  S_RZYE: number;
  S_RQYE: number;
  S_RZMRE: number;
  S_RZRQYE: number;
  S_RZRQYECZ?: number;
  S_RQMCL?: number;
  TOTAL_RZYE: number;
  TOTAL_RQYE: number;
  TOTAL_RZMRE: number;
  TOTAL_RZRQYE: number;
  TOTAL_RZRQYECZ?: number;
}

interface EastmoneyResponse {
  result?: {
    data?: EastmoneyRow[];
  };
}

export function parseEastmoneySummary(payload: {
  tradeDate: string;
  financingBalance: number;
  securitiesLendingBalance: number;
  financingBuy: number;
  financingRepay: number;
  lendingSell?: number;
  breakdown?: {
    sh?: { financingBalance: number; securitiesLendingBalance: number; financingBuy: number; financingRepay: number; lendingSell?: number };
    sz?: { financingBalance: number; securitiesLendingBalance: number; financingBuy: number; financingRepay: number; lendingSell?: number };
  };
}): SourceSnapshot {
  return {
    tradeDate: payload.tradeDate,
    sourceName: 'eastmoney',
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

export async function fetchEastmoneySummary(config: AppConfig): Promise<SourceSnapshot | undefined> {
  const params = new URLSearchParams({
    reportName: 'RPTA_RZRQ_LSDB',
    columns: 'ALL',
    source: 'WEB',
    sortColumns: 'DIM_DATE',
    sortTypes: '-1',
    pageNumber: '1',
    pageSize: '1',
  });

  const response = await fetch(`https://datacenter-web.eastmoney.com/api/data/v1/get?${params.toString()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`eastmoney HTTP ${response.status}`);

  const body = JSON.parse(text) as EastmoneyResponse;
  const row = body.result?.data?.[0];
  if (!row) return undefined;

  return parseEastmoneySummary({
    tradeDate: row.DIM_DATE.split(' ')[0],
    financingBalance: Number(row.TOTAL_RZYE),
    securitiesLendingBalance: Number(row.TOTAL_RQYE),
    financingBuy: Number(row.TOTAL_RZMRE),
    financingRepay: Number(row.TOTAL_RZRQYECZ ? row.TOTAL_RZMRE - (row.TOTAL_RZRQYE - row.TOTAL_RZRQYECZ) : 0),
    breakdown: {
      sh: {
        financingBalance: Number(row.H_RZYE),
        securitiesLendingBalance: Number(row.H_RQYE),
        financingBuy: Number(row.H_RZMRE),
        financingRepay: Number(row.H_RZRQYECZ ? row.H_RZMRE - (row.H_RZRQYE - row.H_RZRQYECZ) : 0),
        lendingSell: Number(row.H_RQMCL ?? 0),
      },
      sz: {
        financingBalance: Number(row.S_RZYE),
        securitiesLendingBalance: Number(row.S_RQYE),
        financingBuy: Number(row.S_RZMRE),
        financingRepay: Number(row.S_RZRQYECZ ? row.S_RZMRE - (row.S_RZRQYE - row.S_RZRQYECZ) : 0),
        lendingSell: Number(row.S_RQMCL ?? 0),
      },
    },
  });
}
