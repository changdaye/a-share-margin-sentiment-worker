import type { AppConfig, SourceSnapshot } from '../types';

interface SseResponseRow {
  opDate: string;
  rzye: number;
  rqylje: number;
  rzmre: number;
  rzche?: number;
  rqmcl?: number;
  rzrqjyzl: number;
}

interface SseResponse {
  result?: SseResponseRow[];
}

export function parseSseSummary(payload: {
  tradeDate: string;
  financingBalance: number;
  securitiesLendingBalance: number;
  financingBuy: number;
  financingRepay: number;
  lendingSell?: number;
}): SourceSnapshot {
  return {
    tradeDate: payload.tradeDate,
    sourceName: 'sse',
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

export async function fetchSseSummary(config: AppConfig): Promise<SourceSnapshot | undefined> {
  const params = new URLSearchParams({
    isPagination: 'true',
    'pageHelp.pageSize': '1',
    'pageHelp.pageNo': '1',
    'pageHelp.beginPage': '1',
    'pageHelp.cacheSize': '1',
    'pageHelp.endPage': '1',
    stockCode: '',
    beginDate: '',
    endDate: '',
    sqlId: 'RZRQ_HZ_INFO',
    jsonCallBack: 'jsonpCallback',
  });

  const response = await fetch(`https://query.sse.com.cn/commonSoaQuery.do?${params.toString()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://www.sse.com.cn/market/othersdata/margin/sum/',
    },
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`sse HTTP ${response.status}`);

  const match = text.match(/^jsonpCallback\((.*)\)$/s);
  if (!match) throw new Error('sse JSONP payload missing');
  const body = JSON.parse(match[1]) as SseResponse;
  const row = body.result?.[0];
  if (!row) return undefined;

  return parseSseSummary({
    tradeDate: `${row.opDate.slice(0, 4)}-${row.opDate.slice(4, 6)}-${row.opDate.slice(6, 8)}`,
    financingBalance: Number(row.rzye),
    securitiesLendingBalance: Number(row.rqylje),
    financingBuy: Number(row.rzmre),
    financingRepay: Number(row.rzche ?? 0),
    lendingSell: Number(row.rqmcl ?? 0),
  });
}
