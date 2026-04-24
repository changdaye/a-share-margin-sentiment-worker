import type { MarketDailySnapshot, MarketSignal } from './types';

export async function upsertMarketDailySnapshot(db: D1Database, snapshot: MarketDailySnapshot): Promise<void> {
  await db.prepare(`
    INSERT INTO market_daily_snapshots (
      trade_date, source_strategy, sse_available, szse_available, eastmoney_used,
      financing_balance, securities_lending_balance, margin_balance_total,
      financing_buy, financing_repay, financing_net_buy,
      lending_sell, lending_repay, lending_net_sell, raw_payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      raw_payload_json = excluded.raw_payload_json
  `).bind(
    snapshot.tradeDate,
    snapshot.sourceStrategy,
    snapshot.sseAvailable ? 1 : 0,
    snapshot.szseAvailable ? 1 : 0,
    snapshot.eastmoneyUsed ? 1 : 0,
    snapshot.financingBalance,
    snapshot.securitiesLendingBalance,
    snapshot.marginBalanceTotal,
    snapshot.financingBuy,
    snapshot.financingRepay,
    snapshot.financingNetBuy,
    snapshot.lendingSell ?? null,
    snapshot.lendingRepay ?? null,
    snapshot.lendingNetSell ?? null,
    snapshot.rawPayloadJson,
  ).run();
}

export async function listRecentSnapshots(db: D1Database, limit: number): Promise<MarketDailySnapshot[]> {
  const result = await db.prepare(`
    SELECT trade_date, source_strategy, sse_available, szse_available, eastmoney_used,
      financing_balance, securities_lending_balance, margin_balance_total,
      financing_buy, financing_repay, financing_net_buy,
      lending_sell, lending_repay, lending_net_sell, raw_payload_json
    FROM market_daily_snapshots ORDER BY trade_date DESC LIMIT ?
  `).bind(limit).all();
  return (result.results ?? []).map((row: any) => ({
    tradeDate: row.trade_date,
    sourceStrategy: row.source_strategy,
    sseAvailable: Number(row.sse_available) === 1,
    szseAvailable: Number(row.szse_available) === 1,
    eastmoneyUsed: Number(row.eastmoney_used) === 1,
    financingBalance: Number(row.financing_balance),
    securitiesLendingBalance: Number(row.securities_lending_balance),
    marginBalanceTotal: Number(row.margin_balance_total),
    financingBuy: Number(row.financing_buy),
    financingRepay: Number(row.financing_repay),
    financingNetBuy: Number(row.financing_net_buy),
    lendingSell: row.lending_sell == null ? undefined : Number(row.lending_sell),
    lendingRepay: row.lending_repay == null ? undefined : Number(row.lending_repay),
    lendingNetSell: row.lending_net_sell == null ? undefined : Number(row.lending_net_sell),
    rawPayloadJson: row.raw_payload_json,
  }));
}

export async function upsertMarketSignal(db: D1Database, signal: MarketSignal): Promise<void> {
  await db.prepare(`
    INSERT INTO market_daily_signals (
      trade_date, financing_balance_pct_250, financing_net_buy_1d_pct_250,
      financing_net_buy_5d, financing_net_buy_5d_pct_250, financing_net_buy_10d,
      lending_balance_pct_250, sentiment_level, alert_state, summary_text, metrics_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trade_date) DO UPDATE SET
      financing_balance_pct_250 = excluded.financing_balance_pct_250,
      financing_net_buy_1d_pct_250 = excluded.financing_net_buy_1d_pct_250,
      financing_net_buy_5d = excluded.financing_net_buy_5d,
      financing_net_buy_5d_pct_250 = excluded.financing_net_buy_5d_pct_250,
      financing_net_buy_10d = excluded.financing_net_buy_10d,
      lending_balance_pct_250 = excluded.lending_balance_pct_250,
      sentiment_level = excluded.sentiment_level,
      alert_state = excluded.alert_state,
      summary_text = excluded.summary_text,
      metrics_json = excluded.metrics_json
  `).bind(
    signal.tradeDate,
    signal.financingBalancePct250,
    signal.financingNetBuy1dPct250,
    signal.financingNetBuy5d,
    signal.financingNetBuy5dPct250,
    signal.financingNetBuy10d,
    signal.lendingBalancePct250 ?? null,
    signal.sentimentLevel,
    signal.alertState,
    signal.summaryText,
    signal.metricsJson,
  ).run();
}

export async function insertNotificationRun(db: D1Database, input: { id: string; tradeDate?: string; runType: string; alertDirection?: string; messageText: string; reportUrl?: string; feishuPushOk: boolean; pushError?: string; }): Promise<void> {
  await db.prepare(`
    INSERT INTO notification_runs (id, trade_date, run_type, alert_direction, message_text, report_url, feishu_push_ok, push_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.id,
    input.tradeDate ?? null,
    input.runType,
    input.alertDirection ?? null,
    input.messageText,
    input.reportUrl ?? null,
    input.feishuPushOk ? 1 : 0,
    input.pushError ?? null,
  ).run();
}
