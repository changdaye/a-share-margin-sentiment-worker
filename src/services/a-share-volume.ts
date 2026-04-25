import type { AppConfig, MarketVolumeSnapshot } from '../types';

interface TencentSeriesEntry {
  day?: string[][];
  qfqday?: string[][];
}

interface TencentResponse {
  code?: number;
  data?: Record<string, TencentSeriesEntry | undefined>;
}

interface LatestVolumeRow {
  tradeDate: string;
  volumeLots: number;
}

const TENCENT_QFQ_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';
const SSE_A_SHARE_INDEX = 'sh000002';
const SZSE_A_SHARE_INDEX = 'sz399107';

export function parseAshareMarketVolumeSnapshot(payload: {
  tradeDate: string;
  sseVolumeLots: number;
  szseVolumeLots: number;
}): MarketVolumeSnapshot {
  const totalVolumeLots = payload.sseVolumeLots + payload.szseVolumeLots;
  return {
    tradeDate: payload.tradeDate,
    marketVolumeShares: totalVolumeLots * 100,
    rawPayload: {
      tradeDate: payload.tradeDate,
      sseVolumeLots: payload.sseVolumeLots,
      szseVolumeLots: payload.szseVolumeLots,
      totalVolumeLots,
    },
  };
}

function parseLatestVolumeRow(symbol: string, payload: TencentResponse): LatestVolumeRow | undefined {
  return parseVolumeRows(symbol, payload).at(-1);
}

function parseVolumeRows(symbol: string, payload: TencentResponse): LatestVolumeRow[] {
  const series = payload.data?.[symbol];
  const rows = series?.qfqday ?? series?.day ?? [];
  return rows.map((row) => ({
    tradeDate: String(row[0] ?? '').trim(),
    volumeLots: Number(row[5]),
  })).filter((row) => row.tradeDate && Number.isFinite(row.volumeLots));
}

async function fetchIndexVolumeSeries(config: AppConfig, symbol: string, count: number): Promise<LatestVolumeRow[]> {
  const url = new URL(TENCENT_QFQ_URL);
  url.searchParams.set('param', `${symbol},day,,,${count},qfq`);

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://gu.qq.com/',
    },
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`market volume HTTP ${response.status}`);

  return parseVolumeRows(symbol, JSON.parse(text) as TencentResponse);
}

async function fetchLatestIndexVolume(config: AppConfig, symbol: string): Promise<LatestVolumeRow | undefined> {
  return (await fetchIndexVolumeSeries(config, symbol, 5)).at(-1);
}

export async function fetchAshareMarketVolume(config: AppConfig): Promise<MarketVolumeSnapshot | undefined> {
  const [sse, szse] = await Promise.all([
    fetchLatestIndexVolume(config, SSE_A_SHARE_INDEX),
    fetchLatestIndexVolume(config, SZSE_A_SHARE_INDEX),
  ]);

  if (!sse || !szse) return undefined;
  if (sse.tradeDate !== szse.tradeDate) {
    throw new Error(`market volume trade date mismatch: ${sse.tradeDate} vs ${szse.tradeDate}`);
  }

  return parseAshareMarketVolumeSnapshot({
    tradeDate: sse.tradeDate,
    sseVolumeLots: sse.volumeLots,
    szseVolumeLots: szse.volumeLots,
  });
}

export async function fetchAshareMarketVolumeHistory(config: AppConfig, count: number): Promise<MarketVolumeSnapshot[]> {
  const [sseRows, szseRows] = await Promise.all([
    fetchIndexVolumeSeries(config, SSE_A_SHARE_INDEX, count),
    fetchIndexVolumeSeries(config, SZSE_A_SHARE_INDEX, count),
  ]);

  const szseByDate = new Map(szseRows.map((row) => [row.tradeDate, row]));

  return sseRows
    .map((sseRow) => {
      const szseRow = szseByDate.get(sseRow.tradeDate);
      if (!szseRow) return undefined;
      return parseAshareMarketVolumeSnapshot({
        tradeDate: sseRow.tradeDate,
        sseVolumeLots: sseRow.volumeLots,
        szseVolumeLots: szseRow.volumeLots,
      });
    })
    .filter((row): row is MarketVolumeSnapshot => Boolean(row));
}
