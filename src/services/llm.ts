import type { AppConfig, MarketDailySnapshot, MarketSignal } from '../types';

interface WorkersAIResult {
  response?: string;
}

const SYSTEM_PROMPT = `你是一名中文财经编辑。请根据A股两融市场级指标，输出一句像人写的盘后点评标题。要求：
1. 只写一句，不超过40个汉字。
2. 语气像盘后简评，不要写成机器指标播报。
3. 不要带时间、链接、编号、标题前缀。
4. 可使用“升温、降温、偏热、偏冷、分歧、观望”等自然表达。`;

export async function summarizeWithLLM(
  config: AppConfig,
  ai: Ai,
  snapshot: MarketDailySnapshot,
  signal: MarketSignal,
  previousSnapshot?: MarketDailySnapshot,
): Promise<string> {
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
    previousSnapshot ? `昨日融资余额: ${previousSnapshot.financingBalance}` : '',
    previousSnapshot ? `昨日融资净买入: ${previousSnapshot.financingNetBuy}` : '',
  ].filter(Boolean).join('\n');

  const result = await ai.run(config.llmModel, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: payload },
    ],
    max_tokens: 120,
    temperature: 0.2,
  }) as WorkersAIResult;

  const content = result.response?.trim();
  if (!content) throw new Error('Workers AI returned empty response');
  return content.replace(/^[#\-\d.、\s]+/, '').split('\n')[0].trim();
}
