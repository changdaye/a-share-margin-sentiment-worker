import { parseConfig } from './config';
import { authorizeAdminRequest } from './lib/admin';
import { getRuntimeState } from './lib/runtime';
import type { Env } from './types';

function json(data: Record<string, unknown>, status = 200): Response {
  return Response.json(data, { status });
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
      return json({ ok: true, accepted: true });
    }

    return json({ ok: false, error: 'not found' }, 404);
  },

  async scheduled(): Promise<void> {
    return;
  },
};
