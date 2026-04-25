import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

class FakeD1Database {
  snapshots: any[] = [];
  signals: any[] = [];
  notifications: any[] = [];

  prepare(sql: string) {
    const db = this;
    return {
      bind(...args: any[]) {
        return {
          async run() {
            if (sql.includes('INSERT INTO market_daily_snapshots')) {
              db.snapshots = db.snapshots.filter((row) => row.trade_date !== args[0]);
              db.snapshots.push({
                trade_date: args[0], source_strategy: args[1], sse_available: args[2], szse_available: args[3], eastmoney_used: args[4],
                financing_balance: args[5], securities_lending_balance: args[6], margin_balance_total: args[7],
                financing_buy: args[8], financing_repay: args[9], financing_net_buy: args[10],
                lending_sell: args[11], lending_repay: args[12], lending_net_sell: args[13], market_volume_shares: args[14], raw_payload_json: args[15],
              });
            } else if (sql.includes('INSERT INTO market_daily_signals')) {
              db.signals = db.signals.filter((row) => row.trade_date !== args[0]);
              db.signals.push({
                trade_date: args[0], financing_balance_pct_250: args[1], financing_net_buy_1d_pct_250: args[2], financing_net_buy_5d: args[3],
                financing_net_buy_5d_pct_250: args[4], financing_net_buy_10d: args[5], lending_balance_pct_250: args[6], market_volume_pct_250: args[7],
                sentiment_level: args[8], alert_state: args[9], summary_text: args[10], metrics_json: args[11],
              });
            } else if (sql.includes('INSERT INTO notification_runs')) {
              db.notifications.push({ run_type: args[2], message_text: args[4], report_url: args[5] });
            }
            return { success: true };
          },
          async all() {
            if (sql.includes('FROM market_daily_snapshots')) {
              return { results: [...db.snapshots].sort((a, b) => String(b.trade_date).localeCompare(String(a.trade_date))).slice(0, args[0]) };
            }
            return { results: [] };
          },
        };
      },
    };
  }
}

describe('admin routes', () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1Database();
  const kvState = new Map<string, string>();

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('query.sse.com.cn/commonSoaQuery.do')) {
        return new Response('jsonpCallback({"result":[{"rzye":100,"rqylje":3,"rzmre":9,"rzche":7,"rzrqjyzl":103,"opDate":"20260424","rqmcl":1}]})');
      }
      if (url.includes('datacenter-web.eastmoney.com/api/data/v1/get')) {
        return new Response(JSON.stringify({
          result: {
            data: [{
              DIM_DATE: '2026-04-24 00:00:00',
              H_RZYE: 100, H_RQYE: 3, H_RZMRE: 9, H_RZRQYE: 103, H_RZRQYECZ: 101, H_RQMCL: 1,
              S_RZYE: 80, S_RQYE: 2, S_RZMRE: 8, S_RZRQYE: 82, S_RZRQYECZ: 80, S_RQMCL: 1,
              TOTAL_RZYE: 180, TOTAL_RQYE: 5, TOTAL_RZMRE: 17, TOTAL_RZRQYE: 185, TOTAL_RZRQYECZ: 181,
            }],
          },
        }));
      }
      if (url.includes('web.ifzq.gtimg.cn/appstock/app/fqkline/get')) {
        return new Response(JSON.stringify({
          code: 0,
          data: {
            sh000002: {
              day: [['2026-04-24', '0', '0', '0', '0', '604375690.000']],
            },
            sz399107: {
              day: [['2026-04-24', '0', '0', '0', '0', '709560997.000']],
            },
          },
        }));
      }
      if (url.includes('myqcloud.com')) {
        return new Response('', { status: 200 });
      }
      if (url.includes('example.com/hook')) {
        return new Response(JSON.stringify({ code: 0 }), { status: 200 });
      }
      if (url.includes('www.szse.cn/disclosure/margin/margin/index.html')) {
        return new Response('<html><body>no daily payload</body></html>', { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects missing bearer token', async () => {
    const env = {
      AI: { run: async () => ({ response: '市场偏热。' }) },
      RUNTIME_KV: { get: async () => kvState.get('runtime_state') ?? null, put: async (_k: string, v: string) => kvState.set('runtime_state', v) },
      WATCHER_DB: db as unknown as D1Database,
      FEISHU_WEBHOOK: 'https://example.com/hook',
      TENCENT_COS_SECRET_ID: 'sid',
      TENCENT_COS_SECRET_KEY: 'skey',
      TENCENT_COS_BUCKET: 'bucket',
      TENCENT_COS_REGION: 'ap-shanghai',
      MANUAL_TRIGGER_TOKEN: 'token',
    } as any;
    const res = await worker.fetch(new Request('https://example.com/admin/trigger', { method: 'POST' }), env);
    expect(res.status).toBe(401);
  });

  it('runs the full digest flow when authorized', async () => {
    const env = {
      AI: { run: async () => ({ response: '市场偏热，融资情绪明显抬升。' }) },
      RUNTIME_KV: { get: async () => kvState.get('runtime_state') ?? null, put: async (_k: string, v: string) => kvState.set('runtime_state', v) },
      WATCHER_DB: db as unknown as D1Database,
      FEISHU_WEBHOOK: 'https://example.com/hook',
      TENCENT_COS_SECRET_ID: 'sid',
      TENCENT_COS_SECRET_KEY: 'skey',
      TENCENT_COS_BUCKET: 'bucket',
      TENCENT_COS_REGION: 'ap-shanghai',
      TENCENT_COS_BASE_URL: 'https://bucket.cos.ap-shanghai.myqcloud.com',
      MANUAL_TRIGGER_TOKEN: 'token',
      FEISHU_SECRET: '',
    } as any;
    const res = await worker.fetch(new Request('https://example.com/admin/trigger', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
    }), env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.reportUrl).toContain('myqcloud.com');
    expect(db.snapshots).toHaveLength(1);
    expect(db.snapshots[0]?.market_volume_shares).toBe(131393668700);
    expect(db.notifications.length).toBeGreaterThanOrEqual(1);
  });
});
