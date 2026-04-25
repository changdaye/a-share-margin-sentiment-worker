import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = new Set(process.argv.slice(2));
const runRemote = argv.has('--remote');
const recentOnly = argv.has('--recent');

const EASTMONEY_PAGE_SIZE = 200;
const HISTORY_BOOTSTRAP_PADDING = 40;
const HISTORY_BOOTSTRAP_MIN_ROWS = 320;
const MAX_TENCENT_VOLUME_ROWS = 2000;
const SNAPSHOT_SQL_CHUNK_SIZE = 20;
const SIGNAL_SQL_CHUNK_SIZE = 50;

function percentileRank(values, value) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return 0;
  const lessOrEqual = finite.filter((item) => item <= value).length;
  return Number(((lessOrEqual / finite.length) * 100).toFixed(2));
}

function sumLast(values, count) {
  return values.slice(-count).reduce((sum, item) => sum + item, 0);
}

function buildSignal(current, historyWindow) {
  const financingBalances = historyWindow.map((row) => row.financingBalance);
  const netBuys = historyWindow.map((row) => row.financingNetBuy);
  const lendingBalances = historyWindow.map((row) => row.securitiesLendingBalance);
  const marketVolumes = historyWindow.map((row) => row.marketVolumeShares).filter((value) => typeof value === 'number');
  const rolling5 = historyWindow.map((_, index, rows) => sumLast(rows.slice(0, index + 1).map((row) => row.financingNetBuy), 5));
  const last5NetBuy = sumLast(netBuys, 5);
  const last10NetBuy = sumLast(netBuys, 10);
  const financingBalancePct250 = percentileRank(financingBalances, current.financingBalance);
  const financingNetBuy1dPct250 = percentileRank(netBuys, current.financingNetBuy);
  const financingNetBuy5dPct250 = percentileRank(rolling5, last5NetBuy);
  const lendingBalancePct250 = percentileRank(lendingBalances, current.securitiesLendingBalance);
  const marketVolumePct250 = typeof current.marketVolumeShares === 'number' && marketVolumes.length
    ? percentileRank(marketVolumes, current.marketVolumeShares)
    : undefined;

  let sentimentLevel = 'neutral';
  if (financingBalancePct250 >= 95 || financingNetBuy5dPct250 >= 90) sentimentLevel = 'hot';
  else if (financingBalancePct250 >= 75 || financingNetBuy5dPct250 >= 75) sentimentLevel = 'warm';
  else if (financingBalancePct250 <= 10 || financingNetBuy5dPct250 <= 10) sentimentLevel = 'cold';
  else if (financingBalancePct250 <= 25 || financingNetBuy5dPct250 <= 25) sentimentLevel = 'cool';

  let alertState = 'none';
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

function parseWranglerConfig() {
  const text = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const dbMatch = text.match(/"database_name"\s*:\s*"([^"]+)"/);
  if (!dbMatch) throw new Error('未在 wrangler.jsonc 中找到 database_name');
  const lookbackMatch = text.match(/"LOOKBACK_DAYS"\s*:\s*"(\d+)"/);
  const lookbackDays = lookbackMatch ? Number(lookbackMatch[1]) : 250;
  return { databaseName: dbMatch[1], lookbackDays };
}

function getBootstrapHistoryRowCount(lookbackDays) {
  return Math.min(Math.max(lookbackDays + HISTORY_BOOTSTRAP_PADDING, HISTORY_BOOTSTRAP_MIN_ROWS), MAX_TENCENT_VOLUME_ROWS);
}

function toFiniteNumber(value) {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sumDefined(values) {
  const numbers = values.filter((value) => typeof value === 'number');
  if (!numbers.length) return undefined;
  return numbers.reduce((sum, value) => sum + value, 0);
}

function firstDefined(...values) {
  return values.find((value) => typeof value === 'number');
}

function deriveTradeDate(raw) {
  return String(raw).split(' ')[0];
}

function buildHistoricalSnapshotFromEastmoneyRow(row) {
  const hasCompleteTotals = typeof toFiniteNumber(row.TOTAL_RZYE) === 'number';
  const hasBothMainBoards = typeof toFiniteNumber(row.H_RZYE) === 'number' && typeof toFiniteNumber(row.S_RZYE) === 'number';
  if (!hasCompleteTotals && !hasBothMainBoards) return undefined;

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
    lendingRepay: undefined,
    lendingNetSell: undefined,
    marketVolumeShares: undefined,
    rawPayloadJson: JSON.stringify({ eastmoney: row }),
  };
}

function hydrateHistoricalFinancingFlows(snapshots) {
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

async function fetchEastmoneyHistory(limit) {
  const snapshots = [];
  let pageNumber = 1;
  while (true) {
    const params = new URLSearchParams({
      reportName: 'RPTA_RZRQ_LSDB',
      columns: 'ALL',
      source: 'WEB',
      sortColumns: 'DIM_DATE',
      sortTypes: '-1',
      pageNumber: String(pageNumber),
      pageSize: String(limit ? Math.min(EASTMONEY_PAGE_SIZE, limit) : EASTMONEY_PAGE_SIZE),
    });
    const response = await fetch(`https://datacenter-web.eastmoney.com/api/data/v1/get?${params.toString()}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error(`eastmoney history HTTP ${response.status}`);
    const body = await response.json();
    const rows = body?.result?.data ?? [];
    if (!rows.length) break;
    for (const row of rows) {
      const snapshot = buildHistoricalSnapshotFromEastmoneyRow(row);
      if (snapshot) snapshots.push(snapshot);
      if (limit && snapshots.length >= limit) break;
    }
    if ((limit && snapshots.length >= limit) || rows.length < Math.min(EASTMONEY_PAGE_SIZE, limit ?? EASTMONEY_PAGE_SIZE)) break;
    pageNumber += 1;
  }
  return hydrateHistoricalFinancingFlows(limit ? snapshots.slice(0, limit) : snapshots);
}

function parseAshareMarketVolumeSnapshot(tradeDate, sseVolumeLots, szseVolumeLots) {
  const totalVolumeLots = sseVolumeLots + szseVolumeLots;
  return {
    tradeDate,
    marketVolumeShares: totalVolumeLots * 100,
    rawPayload: {
      tradeDate,
      sseVolumeLots,
      szseVolumeLots,
      totalVolumeLots,
    },
  };
}

async function fetchTencentVolumeRows(symbol, count) {
  const url = new URL('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get');
  url.searchParams.set('param', `${symbol},day,,,${count},qfq`);
  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://gu.qq.com/',
    },
  });
  if (!response.ok) throw new Error(`market volume HTTP ${response.status}`);
  const payload = await response.json();
  const rows = payload?.data?.[symbol]?.day ?? payload?.data?.[symbol]?.qfqday ?? [];
  return rows.map((row) => ({
    tradeDate: String(row[0] ?? '').trim(),
    volumeLots: Number(row[5]),
  })).filter((row) => row.tradeDate && Number.isFinite(row.volumeLots));
}

async function fetchAshareVolumeHistory(count) {
  const [sseRows, szseRows] = await Promise.all([
    fetchTencentVolumeRows('sh000002', count),
    fetchTencentVolumeRows('sz399107', count),
  ]);
  const szseByDate = new Map(szseRows.map((row) => [row.tradeDate, row]));
  return sseRows.map((sseRow) => {
    const szseRow = szseByDate.get(sseRow.tradeDate);
    if (!szseRow) return undefined;
    return parseAshareMarketVolumeSnapshot(sseRow.tradeDate, sseRow.volumeLots, szseRow.volumeLots);
  }).filter(Boolean);
}

function attachMarketVolume(snapshots, volumeHistory) {
  const volumeByDate = new Map(volumeHistory.map((row) => [row.tradeDate, row]));
  return snapshots.map((snapshot) => {
    const volume = volumeByDate.get(snapshot.tradeDate);
    if (!volume) return snapshot;
    const rawPayload = JSON.parse(snapshot.rawPayloadJson);
    return {
      ...snapshot,
      marketVolumeShares: volume.marketVolumeShares,
      rawPayloadJson: JSON.stringify({
        ...rawPayload,
        marketVolume: volume.rawPayload,
      }),
    };
  });
}

function buildHistoricalSignals(snapshots, lookbackDays) {
  const ordered = [...snapshots].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  return ordered.map((snapshot, index) => {
    const startIndex = Math.max(0, index + 1 - lookbackDays);
    return buildSignal(snapshot, ordered.slice(startIndex, index + 1));
  });
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  return value == null ? 'NULL' : String(value);
}

function sqlBool(value) {
  return value ? '1' : '0';
}

function buildSnapshotInsert(rows) {
  const tuples = rows.map((snapshot) => `(
${sqlString(snapshot.tradeDate)},
${sqlString(snapshot.sourceStrategy)},
${sqlBool(snapshot.sseAvailable)},
${sqlBool(snapshot.szseAvailable)},
${sqlBool(snapshot.eastmoneyUsed)},
${sqlNumber(snapshot.financingBalance)},
${sqlNumber(snapshot.securitiesLendingBalance)},
${sqlNumber(snapshot.marginBalanceTotal)},
${sqlNumber(snapshot.financingBuy)},
${sqlNumber(snapshot.financingRepay)},
${sqlNumber(snapshot.financingNetBuy)},
${sqlNumber(snapshot.lendingSell)},
${sqlNumber(snapshot.lendingRepay)},
${sqlNumber(snapshot.lendingNetSell)},
${sqlNumber(snapshot.marketVolumeShares)},
${sqlString(snapshot.rawPayloadJson)}
)`).join(',\n');

  return `INSERT INTO market_daily_snapshots (
  trade_date, source_strategy, sse_available, szse_available, eastmoney_used,
  financing_balance, securities_lending_balance, margin_balance_total,
  financing_buy, financing_repay, financing_net_buy,
  lending_sell, lending_repay, lending_net_sell, market_volume_shares, raw_payload_json
) VALUES
${tuples}
ON CONFLICT(trade_date) DO UPDATE SET
  source_strategy = excluded.source_strategy,
  sse_available = excluded.sse_available,
  szse_available = excluded.szse_available,
  eastmoney_used = excluded.eastmoney_used,
  financing_balance = excluded.financing_balance,
  securities_lending_balance = excluded.securities_lending_balance,
  margin_balance_total = excluded.margin_balance_total,
  financing_buy = excluded.financing_buy,
  financing_repay = excluded.financing_repay,
  financing_net_buy = excluded.financing_net_buy,
  lending_sell = excluded.lending_sell,
  lending_repay = excluded.lending_repay,
  lending_net_sell = excluded.lending_net_sell,
  market_volume_shares = excluded.market_volume_shares,
  raw_payload_json = excluded.raw_payload_json;`;
}

function buildSignalInsert(rows) {
  const tuples = rows.map((signal) => `(
${sqlString(signal.tradeDate)},
${sqlNumber(signal.financingBalancePct250)},
${sqlNumber(signal.financingNetBuy1dPct250)},
${sqlNumber(signal.financingNetBuy5d)},
${sqlNumber(signal.financingNetBuy5dPct250)},
${sqlNumber(signal.financingNetBuy10d)},
${sqlNumber(signal.lendingBalancePct250)},
${sqlNumber(signal.marketVolumePct250)},
${sqlString(signal.sentimentLevel)},
${sqlString(signal.alertState)},
${sqlString(signal.summaryText)},
${sqlString(signal.metricsJson)}
)`).join(',\n');

  return `INSERT INTO market_daily_signals (
  trade_date, financing_balance_pct_250, financing_net_buy_1d_pct_250,
  financing_net_buy_5d, financing_net_buy_5d_pct_250, financing_net_buy_10d,
  lending_balance_pct_250, market_volume_pct_250, sentiment_level, alert_state, summary_text, metrics_json
) VALUES
${tuples}
ON CONFLICT(trade_date) DO UPDATE SET
  financing_balance_pct_250 = excluded.financing_balance_pct_250,
  financing_net_buy_1d_pct_250 = excluded.financing_net_buy_1d_pct_250,
  financing_net_buy_5d = excluded.financing_net_buy_5d,
  financing_net_buy_5d_pct_250 = excluded.financing_net_buy_5d_pct_250,
  financing_net_buy_10d = excluded.financing_net_buy_10d,
  lending_balance_pct_250 = excluded.lending_balance_pct_250,
  market_volume_pct_250 = excluded.market_volume_pct_250,
  sentiment_level = excluded.sentiment_level,
  alert_state = excluded.alert_state,
  summary_text = excluded.summary_text,
  metrics_json = excluded.metrics_json;`;
}

async function main() {
  const { databaseName, lookbackDays } = parseWranglerConfig();
  const marginLimit = recentOnly ? getBootstrapHistoryRowCount(lookbackDays) : MAX_TENCENT_VOLUME_ROWS;
  const volumeLimit = recentOnly ? getBootstrapHistoryRowCount(lookbackDays) : MAX_TENCENT_VOLUME_ROWS;

  console.log(`开始回填${recentOnly ? '最近窗口' : '历史'}数据到 ${databaseName} (${runRemote ? 'remote' : 'local'}) ...`);
  const [marginSnapshots, volumeHistory] = await Promise.all([
    fetchEastmoneyHistory(marginLimit),
    fetchAshareVolumeHistory(volumeLimit),
  ]);
  const snapshots = attachMarketVolume(marginSnapshots, volumeHistory);
  const signals = buildHistoricalSignals(snapshots, lookbackDays);

  console.log(`两融快照: ${snapshots.length} 条`);
  console.log(`成交量覆盖: ${snapshots.filter((row) => typeof row.marketVolumeShares === 'number').length} 条`);
  console.log(`历史信号: ${signals.length} 条`);

  const sqlStatements = [
    ...chunk(snapshots, SNAPSHOT_SQL_CHUNK_SIZE).map(buildSnapshotInsert),
    ...chunk(signals, SIGNAL_SQL_CHUNK_SIZE).map(buildSignalInsert),
  ].join('\n\n');

  const tempDir = mkdtempSync(join(tmpdir(), 'a-share-margin-backfill-'));
  const sqlFile = join(tempDir, 'backfill-history.sql');
  writeFileSync(sqlFile, sqlStatements, 'utf8');

  try {
    execFileSync('npx', [
      'wrangler',
      'd1',
      'execute',
      databaseName,
      runRemote ? '--remote' : '--local',
      '--file',
      sqlFile,
    ], { stdio: 'inherit' });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('历史回填完成。');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
