import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config';
import type { Env } from '../src/types';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    AI: {} as Ai,
    RUNTIME_KV: {} as KVNamespace,
    WATCHER_DB: {} as D1Database,
    FEISHU_WEBHOOK: 'https://example.com/hook',
    FEISHU_SECRET: 'secret',
    MANUAL_TRIGGER_TOKEN: 'token',
    TENCENT_COS_SECRET_ID: 'sid',
    TENCENT_COS_SECRET_KEY: 'skey',
    TENCENT_COS_BUCKET: 'bucket',
    TENCENT_COS_REGION: 'ap-shanghai',
    TENCENT_COS_BASE_URL: 'https://bucket.cos.ap-shanghai.myqcloud.com',
    RUN_HOUR_LOCAL: '17',
    RUN_MINUTE_LOCAL: '0',
    MARKET_TIMEZONE: 'Asia/Shanghai',
    HEARTBEAT_INTERVAL_HOURS: '24',
    REQUEST_TIMEOUT_MS: '15000',
    LOOKBACK_DAYS: '250',
    ALERT_COOLDOWN_HOURS: '24',
    FAILURE_ALERT_THRESHOLD: '1',
    FAILURE_ALERT_COOLDOWN_MINUTES: '180',
    LLM_MODEL: '@cf/meta/llama-3.1-8b-instruct',
    ...overrides,
  };
}

describe('parseConfig', () => {
  it('parses defaults and required secrets', () => {
    const config = parseConfig(makeEnv());
    expect(config.runHourLocal).toBe(17);
    expect(config.marketTimezone).toBe('Asia/Shanghai');
    expect(config.lookbackDays).toBe(250);
    expect(config.cosBaseUrl).toContain('myqcloud.com');
    expect(config.workerPublicBaseUrl).toBe('https://a-share-margin-sentiment-worker.wanggejiancai822.workers.dev');
    expect(config.llmBaseUrl).toBe('');
    expect(config.llmApiKey).toBe('');
  });

  it('throws when Feishu webhook is missing', () => {
    expect(() => parseConfig(makeEnv({ FEISHU_WEBHOOK: '' }))).toThrow('missing FEISHU_WEBHOOK');
  });
});
