import { describe, expect, it, vi } from 'vitest';
import { summarizeWithLLM } from '../src/services/llm';
import type { AppConfig, MarketDailySnapshot, MarketSignal } from '../src/types';

function makeConfig(): AppConfig {
  return {
    feishuWebhook: 'https://example.com/hook',
    feishuSecret: '',
    manualTriggerToken: 'token',
    cosSecretId: 'secret-id',
    cosSecretKey: 'secret-key',
    cosBucket: 'bucket',
    cosRegion: 'ap-shanghai',
    cosBaseUrl: 'https://bucket.cos.ap-shanghai.myqcloud.com',
    workerPublicBaseUrl: 'https://example.workers.dev',
    llmBaseUrl: '',
    llmApiKey: '',
    runHourLocal: 17,
    runMinuteLocal: 0,
    marketTimezone: 'Asia/Shanghai',
    heartbeatIntervalHours: 24,
    requestTimeoutMs: 15000,
    lookbackDays: 250,
    alertCooldownHours: 24,
    failureAlertThreshold: 1,
    failureAlertCooldownMinutes: 180,
    llmModel: '@cf/meta/llama-3.1-8b-instruct',
  };
}

function makeSnapshot(): MarketDailySnapshot {
  return {
    tradeDate: '2026-04-26',
    sourceStrategy: 'official',
    sseAvailable: true,
    szseAvailable: true,
    eastmoneyUsed: false,
    financingBalance: 1800000000000,
    securitiesLendingBalance: 12000000000,
    marginBalanceTotal: 1812000000000,
    financingBuy: 50000000000,
    financingRepay: 47000000000,
    financingNetBuy: 3000000000,
    marketVolumeShares: 123456789000,
    rawPayloadJson: '{}',
  };
}

function makeSignal(): MarketSignal {
  return {
    tradeDate: '2026-04-26',
    financingBalancePct250: 88.2,
    financingNetBuy1dPct250: 76.1,
    financingNetBuy5d: 8200000000,
    financingNetBuy5dPct250: 92.4,
    financingNetBuy10d: 12600000000,
    marketVolumePct250: 81.3,
    sentimentLevel: 'hot',
    alertState: 'overheat',
    summaryText: '',
    metricsJson: '{}',
  };
}

describe('summarizeWithLLM', () => {
  it('prefers the OpenAI-compatible proxy when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '杠杆情绪继续升温，短线仍偏热。' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await summarizeWithLLM(
      { ...makeConfig(), llmBaseUrl: 'https://proxy.example.com/v1', llmApiKey: 'proxy-key', llmModel: 'gpt-5.4' },
      { run: vi.fn() } as unknown as Ai,
      makeSnapshot(),
      makeSignal(),
    );

    expect(result).toEqual({ headline: '杠杆情绪继续升温，短线仍偏热。', modelLabel: 'GPT 5.4 (xhigh)' });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.model).toBe('gpt-5.4');
    expect(body.reasoning_effort).toBe('xhigh');
    expect(body.max_completion_tokens).toBe(180);
    expect(body.messages[0].content).toContain('盘后点评标题');
  });

  it('falls back to Workers AI when the proxy fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 })));
    const run = vi.fn().mockResolvedValue({ response: '杠杆资金边走边看，情绪仍偏热。' });

    const result = await summarizeWithLLM(
      { ...makeConfig(), llmBaseUrl: 'https://proxy.example.com/v1', llmApiKey: 'proxy-key', llmModel: 'gpt-5.4' },
      { run } as unknown as Ai,
      makeSnapshot(),
      makeSignal(),
    );

    expect(result).toEqual({ headline: '杠杆资金边走边看，情绪仍偏热。', modelLabel: 'Llama 3.2 1B Instruct' });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe('@cf/meta/llama-3.2-1b-instruct');
  });
});
