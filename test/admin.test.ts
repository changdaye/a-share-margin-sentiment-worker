import { describe, expect, it } from 'vitest';
import worker from '../src/index';

const env = {
  AI: { run: async () => ({ response: 'ok' }) },
  RUNTIME_KV: { get: async () => null, put: async () => {} },
  WATCHER_DB: {} as D1Database,
  FEISHU_WEBHOOK: 'https://example.com/hook',
  TENCENT_COS_SECRET_ID: 'sid',
  TENCENT_COS_SECRET_KEY: 'skey',
  TENCENT_COS_BUCKET: 'bucket',
  TENCENT_COS_REGION: 'ap-shanghai',
  MANUAL_TRIGGER_TOKEN: 'token',
} as any;

describe('admin routes', () => {
  it('rejects missing bearer token', async () => {
    const res = await worker.fetch(new Request('https://example.com/admin/trigger', { method: 'POST' }), env);
    expect(res.status).toBe(401);
  });
});
