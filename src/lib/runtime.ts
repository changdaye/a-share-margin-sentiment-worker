import type { RuntimeState } from '../types';

const KEY = 'runtime_state';

export async function getRuntimeState(kv: KVNamespace): Promise<RuntimeState> {
  const raw = await kv.get(KEY);
  if (!raw) return { consecutiveFailures: 0 };
  return JSON.parse(raw) as RuntimeState;
}

export async function setRuntimeState(kv: KVNamespace, state: RuntimeState): Promise<void> {
  await kv.put(KEY, JSON.stringify(state));
}

export function recordSuccess(state: RuntimeState, now = new Date()): RuntimeState {
  return { ...state, lastSuccessAt: now.toISOString(), lastError: undefined, consecutiveFailures: 0 };
}

export function recordFailure(state: RuntimeState, error: string, now = new Date()): RuntimeState {
  return { ...state, lastFailureAt: now.toISOString(), lastError: error, consecutiveFailures: state.consecutiveFailures + 1 };
}
