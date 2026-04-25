import { listRecentSnapshots, upsertMarketDailySnapshot, upsertMarketSignal } from '../db';
import { buildSignal } from '../lib/signals';
import { fetchAshareMarketVolumeHistory } from './a-share-volume';
import type { AppConfig, MarketDailySnapshot, MarketSignal, MarketVolumeSnapshot } from '../types';

interface EastmoneyHistoryRow {
  DIM_DATE: string;
  TOTAL_RZYE?: number | null;
  TOTAL_RQYE?: number | null;
  TOTAL_RZMRE?: number | null;
  TOTAL_RZRQYE?: number | null;
  TOTAL_RZRQYECZ?: number | null;
  H_RZYE?: number | null;
  H_RQYE?: number | null;
  H_RZMRE?: number | null;
  H_RQMCL?: number | null;
  H_RZRQYE?: number | null;
  H_RZRQYECZ?: number | null;
  S_RZYE?: number | null;
  S_RQYE?: number | null;
  S_RZMRE?: number | null;
  S_RQMCL?: number | null;
  S_RZRQYE?: number | null;
  S_RZRQYECZ?: number | null;
  B_RZYE?: number | null;
  B_RQYE?: number | null;
  B_RZMRE?: number | null;
  B_RQMCL?: number | null;
  B_RZRQYE?: number | null;
  B_RZRQYECZ?: number | null;
}

interface EastmoneyHistoryResponse {
  result?: {
    data?: EastmoneyHistoryRow[];
  };
}

const EASTMONEY_PAGE_SIZE = 200;
const HISTORY_BOOTSTRAP_PADDING = 40;
const HISTORY_BOOTSTRAP_MIN_ROWS = 320;
const MAX_TENCENT_VOLUME_ROWS = 2000;

function toFiniteNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  const numbers = values.filter((value): value is number => typeof value === 'number');
  if (!numbers.length) return undefined;
  return numbers.reduce((sum, value) => sum + value, 0);
}

function firstDefined(...values: Array<number | undefined>): number | undefined {
  return values.find((value): value is number => typeof value === 'number');
}

function deriveTradeDate(raw: string): string {
  return raw.split(' ')[0] ?? raw;
}

export function buildHistoricalSnapshotFromEastmoneyRow(row: EastmoneyHistoryRow): MarketDailySnapshot | undefined {
  const hasCompleteTotals = typeof toFiniteNumber(row.TOTAL_RZYE) === 'number';
  const hasBothMainBoards = typeof toFiniteNumber(row.H_RZYE) === 'number' && typeof toFiniteNumber(row.S_RZYE) === 'number';
  if (!hasCompleteTotals && !hasBothMainBoards) {
    return undefined;
  }

  const financingBalance = firstDefined(
    toFiniteNumber(row.TOTAL_RZYE),
    sumDefined([toFiniteNumber(row.H_RZYE), toFiniteNumber(row.S_RZYE), toFiniteNumber(row.B_RZYE)]),
  );
  const securitiesLendingBalance = firstDefined(
    toFiniteNumber(row.TOTAL_RQYE),
    sumDefined([toFiniteNumber(row.H_RQYE), toFiniteNumber(row.S_RQYE), toFiniteNumber(row.B_RQYE)]),
    0,
  );
  const marginBalanceTotal = firstDefined(
    toFiniteNumber(row.TOTAL_RZRQYE),
    sumDefined([toFiniteNumber(row.H_RZRQYE), toFiniteNumber(row.S_RZRQYE), toFiniteNumber(row.B_RZRQYE)]),
    typeof financingBalance === 'number' ? financingBalance + (securitiesLendingBalance ?? 0) : undefined,
  );
  const financingBuy = firstDefined(
    toFiniteNumber(row.TOTAL_RZMRE),
    sumDefined([toFiniteNumber(row.H_RZMRE), toFiniteNumber(row.S_RZMRE), toFiniteNumber(row.B_RZMRE)]),
    0,
  );
  const lendingSell = sumDefined([toFiniteNumber(row.H_RQMCL), toFiniteNumber(row.S_RQMCL), toFiniteNumber(row.B_RQMCL)]);

  if (typeof financingBalance !== 'number' || typeof marginBalanceTotal !== 'number' || typeof financingBuy !== 'number') {
    return undefined;
  }

  return {
    tradeDate: deriveTradeDate(row.DIM_DATE),
    sourceStrategy: 'fallback_eastmoney',
    sseAvailable: false,
    szseAvailable: false,
    eastmoneyUsed: true,
    financingBalance,
    securitiesLendingBalance: securitiesLendingBalance ?? 0,
    marginBalanceTotal,
    financingBuy,
    financingRepay: 0,
    financingNetBuy: 0,
    lendingSell,
    rawPayloadJson: JSON.stringify({ eastmoney: row }),
  };
}

export function hydrateHistoricalFinancingFlows(snapshots: MarketDailySnapshot[]): MarketDailySnapshot[] {
  const ordered = [...snapshots].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  return ordered.map((snapshot, index) => {
    if (index === 0) {
      return {
        ...snapshot,
        financingNetBuy: 0,
        financingRepay: snapshot.financingBuy,
      };
    }

    const previous = ordered[index - 1];
    const financingNetBuy = snapshot.financingBalance - previous.financingBalance;
    return {
      ...snapshot,
      financingNetBuy,
      financingRepay: snapshot.financingBuy - financingNetBuy,
    };
  });
}

export function attachMarketVolumeToSnapshot(snapshot: MarketDailySnapshot, marketVolume?: MarketVolumeSnapshot): MarketDailySnapshot {
  if (!marketVolume || marketVolume.tradeDate !== snapshot.tradeDate) {
    return snapshot;
  }

  let rawPayload: Record<string, unknown> = {};
  try {
    rawPayload = JSON.parse(snapshot.rawPayloadJson) as Record<string, unknown>;
  } catch {
    rawPayload = {};
  }

  return {
    ...snapshot,
    marketVolumeShares: marketVolume.marketVolumeShares,
    rawPayloadJson: JSON.stringify({
      ...rawPayload,
      marketVolume: marketVolume.rawPayload,
    }),
  };
}

export function shouldBootstrapHistory(recentSnapshots: MarketDailySnapshot[], lookbackDays: number): boolean {
  const requiredRows = Math.max(lookbackDays - 1, 1);
  const recentWindow = recentSnapshots.slice(0, requiredRows);
  if (recentWindow.length < requiredRows) {
    return true;
  }
  return recentWindow.some((row) => typeof row.marketVolumeShares !== 'number');
}

export function buildHistoricalSignals(snapshots: MarketDailySnapshot[], lookbackDays: number): MarketSignal[] {
  const ordered = [...snapshots].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  return ordered.map((snapshot, index) => {
    const startIndex = Math.max(0, index + 1 - lookbackDays);
    const window = ordered.slice(startIndex, index + 1);
    return {
      ...buildSignal(snapshot, window),
      summaryText: '',
    };
  });
}

export function getBootstrapHistoryRowCount(lookbackDays: number): number {
  return Math.min(Math.max(lookbackDays + HISTORY_BOOTSTRAP_PADDING, HISTORY_BOOTSTRAP_MIN_ROWS), MAX_TENCENT_VOLUME_ROWS);
}

async function fetchEastmoneyHistoryPage(config: AppConfig, pageNumber: number, pageSize: number): Promise<EastmoneyHistoryRow[]> {
  const params = new URLSearchParams({
    reportName: 'RPTA_RZRQ_LSDB',
    columns: 'ALL',
    source: 'WEB',
    sortColumns: 'DIM_DATE',
    sortTypes: '-1',
    pageNumber: String(pageNumber),
    pageSize: String(pageSize),
  });

  const response = await fetch(`https://datacenter-web.eastmoney.com/api/data/v1/get?${params.toString()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`eastmoney history HTTP ${response.status}`);

  return (JSON.parse(text) as EastmoneyHistoryResponse).result?.data ?? [];
}

async function fetchHistoricalMarginSnapshots(config: AppConfig, limit: number): Promise<MarketDailySnapshot[]> {
  const snapshots: MarketDailySnapshot[] = [];
  let pageNumber = 1;

  while (snapshots.length < limit) {
    const rows = await fetchEastmoneyHistoryPage(config, pageNumber, Math.min(EASTMONEY_PAGE_SIZE, limit));
    if (!rows.length) break;

    for (const row of rows) {
      const snapshot = buildHistoricalSnapshotFromEastmoneyRow(row);
      if (snapshot) snapshots.push(snapshot);
      if (snapshots.length >= limit) break;
    }

    if (rows.length < Math.min(EASTMONEY_PAGE_SIZE, limit)) break;
    pageNumber += 1;
  }

  return snapshots
    .slice(0, limit)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
}

export async function bootstrapHistoryIfNeeded(db: D1Database, config: AppConfig): Promise<{ hydrated: boolean; snapshotCount: number; signalCount: number; }> {
  const recentSnapshots = await listRecentSnapshots(db, config.lookbackDays);
  if (!shouldBootstrapHistory(recentSnapshots, config.lookbackDays)) {
    return { hydrated: false, snapshotCount: 0, signalCount: 0 };
  }

  const targetRows = getBootstrapHistoryRowCount(config.lookbackDays);
  const [marginSnapshots, volumeHistory] = await Promise.all([
    fetchHistoricalMarginSnapshots(config, targetRows),
    fetchAshareMarketVolumeHistory(config, targetRows),
  ]);

  const volumeByDate = new Map(volumeHistory.map((row) => [row.tradeDate, row]));
  const hydratedSnapshots = hydrateHistoricalFinancingFlows(marginSnapshots)
    .map((snapshot) => attachMarketVolumeToSnapshot(snapshot, volumeByDate.get(snapshot.tradeDate)));
  const signals = buildHistoricalSignals(hydratedSnapshots, config.lookbackDays);

  for (const snapshot of hydratedSnapshots) {
    await upsertMarketDailySnapshot(db, snapshot);
  }
  for (const signal of signals) {
    await upsertMarketSignal(db, signal);
  }

  return {
    hydrated: true,
    snapshotCount: hydratedSnapshots.length,
    signalCount: signals.length,
  };
}
