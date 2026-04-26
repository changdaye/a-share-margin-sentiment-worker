import type { AppConfig, Env } from './types';
import { toInt } from './lib/value';

export function parseConfig(env: Env): AppConfig {
  if (!env.FEISHU_WEBHOOK?.trim()) throw new Error('missing FEISHU_WEBHOOK');
  if (!env.TENCENT_COS_SECRET_ID?.trim()) throw new Error('missing TENCENT_COS_SECRET_ID');
  if (!env.TENCENT_COS_SECRET_KEY?.trim()) throw new Error('missing TENCENT_COS_SECRET_KEY');
  if (!env.TENCENT_COS_BUCKET?.trim()) throw new Error('missing TENCENT_COS_BUCKET');
  if (!env.TENCENT_COS_REGION?.trim()) throw new Error('missing TENCENT_COS_REGION');

  const bucket = env.TENCENT_COS_BUCKET.trim();
  const region = env.TENCENT_COS_REGION.trim();

  return {
    feishuWebhook: env.FEISHU_WEBHOOK.trim(),
    feishuSecret: env.FEISHU_SECRET?.trim() ?? '',
    manualTriggerToken: env.MANUAL_TRIGGER_TOKEN?.trim() ?? '',
    cosSecretId: env.TENCENT_COS_SECRET_ID.trim(),
    cosSecretKey: env.TENCENT_COS_SECRET_KEY.trim(),
    cosBucket: bucket,
    cosRegion: region,
    cosBaseUrl: env.TENCENT_COS_BASE_URL?.trim() || `https://${bucket}.cos.${region}.myqcloud.com`,

    workerPublicBaseUrl: env.WORKER_PUBLIC_BASE_URL?.trim() || "https://a-share-margin-sentiment-worker.qingjiaowochangdaye.workers.dev",
    runHourLocal: toInt(env.RUN_HOUR_LOCAL, 17, 0),
    runMinuteLocal: toInt(env.RUN_MINUTE_LOCAL, 0, 0),
    marketTimezone: env.MARKET_TIMEZONE?.trim() || 'Asia/Shanghai',
    heartbeatIntervalHours: toInt(env.HEARTBEAT_INTERVAL_HOURS, 24, 1),
    requestTimeoutMs: toInt(env.REQUEST_TIMEOUT_MS, 15000, 1000),
    lookbackDays: toInt(env.LOOKBACK_DAYS, 250, 30),
    alertCooldownHours: toInt(env.ALERT_COOLDOWN_HOURS, 24, 1),
    failureAlertThreshold: toInt(env.FAILURE_ALERT_THRESHOLD, 1, 1),
    failureAlertCooldownMinutes: toInt(env.FAILURE_ALERT_COOLDOWN_MINUTES, 180, 1),
    llmModel: env.LLM_MODEL?.trim() || '@cf/meta/llama-3.1-8b-instruct',
  };
}
