export interface Env {
  AI: Ai;
  RUNTIME_KV: KVNamespace;
  WATCHER_DB: D1Database;
  FEISHU_WEBHOOK: string;
  FEISHU_SECRET?: string;
  MANUAL_TRIGGER_TOKEN?: string;
  TENCENT_COS_SECRET_ID: string;
  TENCENT_COS_SECRET_KEY: string;
  TENCENT_COS_BUCKET: string;
  TENCENT_COS_REGION: string;
  TENCENT_COS_BASE_URL?: string;
  RUN_HOUR_LOCAL?: string;
  RUN_MINUTE_LOCAL?: string;
  MARKET_TIMEZONE?: string;
  HEARTBEAT_INTERVAL_HOURS?: string;
  REQUEST_TIMEOUT_MS?: string;
  LOOKBACK_DAYS?: string;
  ALERT_COOLDOWN_HOURS?: string;
  FAILURE_ALERT_THRESHOLD?: string;
  FAILURE_ALERT_COOLDOWN_MINUTES?: string;
  LLM_MODEL?: string;
}

export interface AppConfig {
  feishuWebhook: string;
  feishuSecret: string;
  manualTriggerToken: string;
  cosSecretId: string;
  cosSecretKey: string;
  cosBucket: string;
  cosRegion: string;
  cosBaseUrl: string;
  runHourLocal: number;
  runMinuteLocal: number;
  marketTimezone: string;
  heartbeatIntervalHours: number;
  requestTimeoutMs: number;
  lookbackDays: number;
  alertCooldownHours: number;
  failureAlertThreshold: number;
  failureAlertCooldownMinutes: number;
  llmModel: string;
}

export interface SourceSnapshot {
  tradeDate: string;
  financingBalance?: number;
  securitiesLendingBalance?: number;
  marginBalanceTotal?: number;
  financingBuy?: number;
  financingRepay?: number;
  financingNetBuy?: number;
  lendingSell?: number;
  lendingRepay?: number;
  lendingNetSell?: number;
  sourceName: 'sse' | 'szse' | 'eastmoney';
  rawPayload: unknown;
}

export interface MarketDailySnapshot {
  tradeDate: string;
  sourceStrategy: 'official' | 'fallback_eastmoney' | 'mixed';
  sseAvailable: boolean;
  szseAvailable: boolean;
  eastmoneyUsed: boolean;
  financingBalance: number;
  securitiesLendingBalance: number;
  marginBalanceTotal: number;
  financingBuy: number;
  financingRepay: number;
  financingNetBuy: number;
  lendingSell?: number;
  lendingRepay?: number;
  lendingNetSell?: number;
  rawPayloadJson: string;
}

export type SentimentLevel = 'cold' | 'cool' | 'neutral' | 'warm' | 'hot';
export type AlertState = 'none' | 'overheat' | 'cooling';

export interface MarketSignal {
  tradeDate: string;
  financingBalancePct250: number;
  financingNetBuy1dPct250: number;
  financingNetBuy5d: number;
  financingNetBuy5dPct250: number;
  financingNetBuy10d: number;
  lendingBalancePct250?: number;
  sentimentLevel: SentimentLevel;
  alertState: AlertState;
  summaryText: string;
  metricsJson: string;
}

export interface RuntimeState {
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastHeartbeatAt?: string;
  lastAlertAt?: string;
  lastAlertDirection?: AlertState;
  lastError?: string;
  consecutiveFailures: number;
}
