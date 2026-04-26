import { parseConfig } from './config';
import { insertNotificationRun, listRecentSnapshots, upsertMarketDailySnapshot, upsertMarketSignal } from './db';
import { authorizeAdminRequest } from './lib/admin';
import { buildComparisonNarrative, buildMetricComparisonRows, formatRelativeChangeText } from './lib/comparison';
import { buildSignal } from './lib/signals';
import { buildAlertMessage, buildDailyMessage, buildFailureAlertMessage, buildHeartbeatMessage } from './lib/message';
import { buildDetailedReport } from './lib/report';
import { buildDetailedReportPublicUrl, maybeHandleDetailedReportRequest, saveDetailedReportCopy } from './lib/report-storage';
import { getRuntimeState, recordFailure, recordSuccess, setRuntimeState, shouldSendDirectionalAlert, shouldSendFailureAlert, shouldSendHeartbeat } from './lib/runtime';
import { uploadDetailedReportToCos } from './services/cos';
import { fetchAshareMarketVolume } from './services/a-share-volume';
import { fetchEastmoneySummary } from './services/eastmoney';
import { fetchSseSummary } from './services/exchange-sse';
import { fetchSzseSummary } from './services/exchange-szse';
import { pushToFeishu } from './services/feishu';
import { attachMarketVolumeToSnapshot, bootstrapHistoryIfNeeded } from './services/history-backfill';
import { summarizeWithLLM } from './services/llm';
import { reconcileSnapshots } from './services/reconcile';
import type { AlertState, Env, MarketDailySnapshot, MarketSignal, RuntimeState } from './types';

const COMPARISON_HISTORY_LIMIT = 2000;

function json(data: Record<string, unknown>, status = 200): Response {
  return Response.json(data, { status });
}

function formatYi(value: number): string {
  return `${(value / 1e8).toFixed(2)}亿元`;
}

function formatYiShares(value: number): string {
  return `${(value / 1e8).toFixed(2)}亿股`;
}

function fallbackHeadline(signal: MarketSignal): string {
  const cn = {
    hot: '杠杆资金延续升温，盘后情绪仍偏热。',
    warm: '杠杆情绪继续回暖，盘后整体偏积极。',
    neutral: '两融情绪总体平稳，盘后仍偏中性。',
    cool: '杠杆情绪边际降温，盘后转向谨慎。',
    cold: '杠杆情绪明显转冷，盘后偏弱。',
  } as const;
  return cn[signal.sentimentLevel];
}

function buildDailyCommentary(
  headline: string,
  snapshot: MarketDailySnapshot,
  signal: MarketSignal,
  comparisonNarrative?: string,
  previousSnapshot?: MarketDailySnapshot,
): string {
  const dayCompare = previousSnapshot
    ? `融资余额较昨日${formatRelativeChangeText(snapshot.financingBalance, previousSnapshot.financingBalance)}，当日融资净买入较昨日${formatRelativeChangeText(snapshot.financingNetBuy, previousSnapshot.financingNetBuy)}。`
    : '当前库中缺少昨日快照，暂不展示日环比对比。';

  const alertLine = signal.alertState === 'overheat'
    ? '当前已触发过热预警，短期需要留意杠杆情绪是否继续堆积。'
    : signal.alertState === 'cooling'
      ? '当前已触发转冷预警，短期需要留意杠杆资金是否继续回落。'
      : '当前未触发额外预警，市场情绪仍以存量变化为主。';

  const volumeLine = typeof snapshot.marketVolumeShares === 'number'
    ? typeof previousSnapshot?.marketVolumeShares === 'number'
      ? `A股成交量 ${formatYiShares(snapshot.marketVolumeShares)}，较昨日${formatRelativeChangeText(snapshot.marketVolumeShares, previousSnapshot.marketVolumeShares)}。`
      : `A股成交量 ${formatYiShares(snapshot.marketVolumeShares)}。`
    : undefined;

  return [
    headline,
    `融资余额 ${formatYi(snapshot.financingBalance)}，两融余额 ${formatYi(snapshot.marginBalanceTotal)}。`,
    dayCompare,
    `当日融资净买入 ${formatYi(snapshot.financingNetBuy)}，5日累计 ${formatYi(signal.financingNetBuy5d)}。`,
    volumeLine,
    comparisonNarrative,
    alertLine,
  ].filter((line): line is string => Boolean(line)).join('\n');
}

function alertReason(signal: MarketSignal): string {
  return signal.alertState === 'overheat'
    ? `融资余额分位 ${signal.financingBalancePct250}%，5日融资净买入分位 ${signal.financingNetBuy5dPct250}%` 
    : `5日融资净买入分位 ${signal.financingNetBuy5dPct250}%，短期杠杆资金明显转弱`;
}

async function fetchSources(env: Env) {
  const config = parseConfig(env);
  const [sse, szse, eastmoney, marketVolume] = await Promise.all([
    fetchSseSummary(config).catch(() => undefined),
    fetchSzseSummary(config).catch(() => undefined),
    fetchEastmoneySummary(config).catch(() => undefined),
    fetchAshareMarketVolume(config).catch(() => undefined),
  ]);
  return { config, sse, szse, eastmoney, marketVolume };
}

export async function runDailyDigest(env: Env): Promise<{ snapshot: MarketDailySnapshot; signal: MarketSignal; reportUrl: string }> {
  const { config, sse, szse, eastmoney, marketVolume } = await fetchSources(env);
  const runtime = await getRuntimeState(env.RUNTIME_KV);
  const now = new Date();

  try {
    const snapshot = attachMarketVolumeToSnapshot(reconcileSnapshots({ sse, szse, eastmoney }), marketVolume);
    try {
      await bootstrapHistoryIfNeeded(env.WATCHER_DB, config);
    } catch (error) {
      console.warn('history bootstrap skipped after failure', error);
    }
    const historyRows = (await listRecentSnapshots(env.WATCHER_DB, COMPARISON_HISTORY_LIMIT))
      .filter((row) => row.tradeDate !== snapshot.tradeDate)
      .reverse();
    const previousSnapshot = historyRows.at(-1);
    const signalHistoryRows = historyRows.slice(-config.lookbackDays);
    const signal = buildSignal(snapshot, [...signalHistoryRows, snapshot]);
    const comparisonNarrative = buildComparisonNarrative(buildMetricComparisonRows({
      snapshot,
      signal,
      historicalSnapshots: historyRows,
      previousSnapshot,
    }));

    let headline = fallbackHeadline(signal);
    try {
      headline = await summarizeWithLLM(config, env.AI, snapshot, signal, previousSnapshot);
    } catch {
      headline = fallbackHeadline(signal);
    }
    const summary = buildDailyCommentary(headline, snapshot, signal, comparisonNarrative, previousSnapshot);

    const enrichedSignal: MarketSignal = { ...signal, summaryText: summary };
    await upsertMarketDailySnapshot(env.WATCHER_DB, snapshot);
    await upsertMarketSignal(env.WATCHER_DB, enrichedSignal);

    const report = buildDetailedReport({
      generatedAt: now,
      tradeDate: snapshot.tradeDate,
      summary,
      snapshot,
      previousSnapshot,
      historicalSnapshots: historyRows,
      signal: enrichedSignal,
    });
    const uploaded = await uploadDetailedReportToCos(config, report, now);
    await saveDetailedReportCopy(env.RUNTIME_KV, uploaded.key, report);
    const publicReportUrl = buildDetailedReportPublicUrl(config.workerPublicBaseUrl, uploaded.key);
    const dailyMessage = buildDailyMessage(summary, publicReportUrl);
    await pushToFeishu(config, dailyMessage);
    await insertNotificationRun(env.WATCHER_DB, {
      id: crypto.randomUUID(),
      tradeDate: snapshot.tradeDate,
      runType: 'daily_summary',
      messageText: dailyMessage,
      reportUrl: publicReportUrl,
      feishuPushOk: true,
    });

    let nextState: RuntimeState = recordSuccess(runtime, now);
    if (enrichedSignal.alertState !== 'none' && shouldSendDirectionalAlert(nextState, enrichedSignal.alertState as Exclude<AlertState, 'none'>, config.alertCooldownHours, now)) {
      const alertMessage = buildAlertMessage(enrichedSignal.alertState as Exclude<AlertState, 'none'>, alertReason(enrichedSignal), publicReportUrl);
      await pushToFeishu(config, alertMessage);
      await insertNotificationRun(env.WATCHER_DB, {
        id: crypto.randomUUID(),
        tradeDate: snapshot.tradeDate,
        runType: 'alert',
        alertDirection: enrichedSignal.alertState,
        messageText: alertMessage,
        reportUrl: publicReportUrl,
        feishuPushOk: true,
      });
      nextState = { ...nextState, lastAlertAt: now.toISOString(), lastAlertDirection: enrichedSignal.alertState };
    }

    if (shouldSendHeartbeat(nextState, config.heartbeatIntervalHours, now)) {
      const heartbeat = buildHeartbeatMessage(nextState, config.heartbeatIntervalHours);
      await pushToFeishu(config, heartbeat);
      await insertNotificationRun(env.WATCHER_DB, {
        id: crypto.randomUUID(),
        tradeDate: snapshot.tradeDate,
        runType: 'heartbeat',
        messageText: heartbeat,
        feishuPushOk: true,
      });
      nextState = { ...nextState, lastHeartbeatAt: now.toISOString() };
    }

    await setRuntimeState(env.RUNTIME_KV, nextState);
    return { snapshot, signal: enrichedSignal, reportUrl: publicReportUrl };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    let nextState = recordFailure(runtime, detail, now);
    if (shouldSendFailureAlert(nextState, config.failureAlertThreshold, config.failureAlertCooldownMinutes, now)) {
      const failure = buildFailureAlertMessage(nextState, config.failureAlertThreshold);
      try {
        await pushToFeishu(config, failure);
        nextState = { ...nextState, lastAlertAt: now.toISOString(), lastAlertDirection: 'none' };
      } catch {
        // ignore secondary alert failure
      }
    }
    await setRuntimeState(env.RUNTIME_KV, nextState);
    throw error;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const reportResponse = await maybeHandleDetailedReportRequest(request, env.RUNTIME_KV);
      if (reportResponse) return reportResponse;
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json({ ok: true, runtimeState: await getRuntimeState(env.RUNTIME_KV) });
    }

    if (request.method === 'POST' && url.pathname === '/admin/trigger') {
      const auth = authorizeAdminRequest(request, parseConfig(env).manualTriggerToken);
      if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
      const result = await runDailyDigest(env);
      return json({ ok: true, tradeDate: result.snapshot.tradeDate, alertState: result.signal.alertState, reportUrl: result.reportUrl });
    }

    return json({ ok: false, error: 'not found' }, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await runDailyDigest(env);
  },
};
