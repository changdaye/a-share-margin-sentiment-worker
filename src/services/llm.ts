import type { AppConfig, MarketDailySnapshot, MarketSignal } from '../types';

interface WorkersAIResult {
  response?: string;
}

const SYSTEM_PROMPT = `你是一名中文财经摘要助手。请根据给定的A股两融市场级指标，输出简短、清晰、适合飞书发送的收盘总结。不要出现时间戳、原始来源链接和多余标题。`;

export async function summarizeWithLLM(config: AppConfig, ai: Ai, snapshot: MarketDailySnapshot, signal: MarketSignal): Promise<string> {
  const payload = [
    `交易日期: ${snapshot.tradeDate}`,
    `融资余额: ${snapshot.financingBalance}`,
    `融券余额: ${snapshot.securitiesLendingBalance}`,
    `两融余额: ${snapshot.marginBalanceTotal}`,
    `当日融资净买入: ${snapshot.financingNetBuy}`,
    `5日融资净买入: ${signal.financingNetBuy5d}`,
    `融资余额分位: ${signal.financingBalancePct250}`,
    `5日融资净买入分位: ${signal.financingNetBuy5dPct250}`,
    `情绪标签: ${signal.sentimentLevel}`,
    `预警状态: ${signal.alertState}`,
  ].join('\n');

  const result = await ai.run(config.llmModel, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: payload },
    ],
    max_tokens: 300,
    temperature: 0.2,
  }) as WorkersAIResult;

  const content = result.response?.trim();
  if (!content) throw new Error('Workers AI returned empty response');
  return content;
}
