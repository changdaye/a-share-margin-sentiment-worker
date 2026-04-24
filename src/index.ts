import { parseConfig } from './config';
import { insertNotificationRun, listRecentSnapshots, upsertMarketDailySnapshot, upsertMarketSignal } from './db';
import { authorizeAdminRequest } from './lib/admin';
import { buildSignal } from './lib/signals';
import { buildAlertMessage, buildDailyMessage, buildFailureAlertMessage, buildHeartbeatMessage } from './lib/message';
import { buildDetailedReport } from './lib/report';
import { getRuntimeState, recordFailure, recordSuccess, setRuntimeState, shouldSendDirectionalAlert, shouldSendFailureAlert, shouldSendHeartbeat } from './lib/runtime';
import { uploadDetailedReportToCos } from './services/cos';
import { fetchEastmoneySummary } from './services/eastmoney';
import { fetchSseSummary } from './services/exchange-sse';
import { fetchSzseSummary } from './services/exchange-szse';
import { pushToFeishu } from './services/feishu';
import { summarizeWithLLM } from './services/llm';
import { reconcileSnapshots } from './services/reconcile';
import type { AlertState, Env, MarketDailySnapshot, MarketSignal, RuntimeState, SourceSnapshot } from './types';

function json(data: Record<string, unknown>, status = 200): Response {
  return Response.json(data, { status });
}

function fallbackSummary(snapshot: MarketDailySnapshot, signal: MarketSignal): string {
  const cn = {
    hot: '过热',
    warm: '偏热',
    neutral: '中性',
    cool: '偏冷',
    cold: '过冷',
  } as const;
  return [
    `今日结论：${cn[signal.sentimentLevel]}`,
    `融资余额 ${snapshot.financingBalance}，当日融资净买入 ${snapshot.financingNetBuy}。`,
    `5日融资净买入 ${signal.financingNetBuy5d}，融资余额分位 ${signal.financingBalancePct250}。`,
  ].join(' ');
}

function alertReason(signal: MarketSignal): string {
  return signal.alertState === 'overheat'
    ? `融资余额分位 ${signal.financingBalancePct250}，5日融资净买入分位 ${signal.financingNetBuy5dPct250}`
    : `5日融资净买入分位 ${signal.financingNetBuy5dPct250}，短期杠杆资金明显转弱`;
}

async function fetchSources(env: Env) {
  const config = parseConfig(env);
  const [sse, szse, eastmoney] = await Promise.all([
    fetchSseSummary(config).catch(() => undefined),
    fetchSzseSummary(config).catch(() => undefined),
    fetchEastmoneySummary(config).catch(() => undefined),
  ]);
  return { config, sse, szse, eastmoney };
}

export async function runDailyDigest(env: Env): Promise<{ snapshot: MarketDailySnapshot; signal: MarketSignal; reportUrl: string }> {
  const { config, sse, szse, eastmoney } = await fetchSources(env);
  const runtime = await getRuntimeState(env.RUNTIME_KV);
  const now = new Date();

  try {
    const snapshot = reconcileSnapshots({ sse, szse, eastmoney });
    const historyRows = (await listRecentSnapshots(env.WATCHER_DB, config.lookbackDays))
      .filter((row) => row.tradeDate !== snapshot.tradeDate)
      .reverse();
    const signal = buildSignal(snapshot, [...historyRows, snapshot]);

    let summary = fallbackSummary(snapshot, signal);
    try {
      summary = await summarizeWithLLM(config, env.AI, snapshot, signal);
    } catch {
      summary = fallbackSummary(snapshot, signal);
    }

    const enrichedSignal: MarketSignal = { ...signal, summaryText: summary };
    await upsertMarketDailySnapshot(env.WATCHER_DB, snapshot);
    await upsertMarketSignal(env.WATCHER_DB, enrichedSignal);

    const report = buildDetailedReport({
      generatedAt: now,
      tradeDate: snapshot.tradeDate,
      summary,
      snapshot,
      signal: enrichedSignal,
    });
    const uploaded = await uploadDetailedReportToCos(config, report, now);
    const dailyMessage = buildDailyMessage(summary, uploaded.url);
    await pushToFeishu(config, dailyMessage);
    await insertNotificationRun(env.WATCHER_DB, {
      id: crypto.randomUUID(),
      tradeDate: snapshot.tradeDate,
      runType: 'daily_summary',
      messageText: dailyMessage,
      reportUrl: uploaded.url,
      feishuPushOk: true,
    });

    let nextState: RuntimeState = recordSuccess(runtime, now);
    if (enrichedSignal.alertState !== 'none' && shouldSendDirectionalAlert(nextState, enrichedSignal.alertState as Exclude<AlertState, 'none'>, config.alertCooldownHours, now)) {
      const alertMessage = buildAlertMessage(enrichedSignal.alertState as Exclude<AlertState, 'none'>, alertReason(enrichedSignal), uploaded.url);
      await pushToFeishu(config, alertMessage);
      await insertNotificationRun(env.WATCHER_DB, {
        id: crypto.randomUUID(),
        tradeDate: snapshot.tradeDate,
        runType: 'alert',
        alertDirection: enrichedSignal.alertState,
        messageText: alertMessage,
        reportUrl: uploaded.url,
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
    return { snapshot, signal: enrichedSignal, reportUrl: uploaded.url };
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
