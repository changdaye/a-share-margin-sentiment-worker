import type { AppConfig, LLMHeadlineResult, MarketDailySnapshot, MarketSignal } from '../types';

const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.2-1b-instruct';
const OPENAI_COMPAT_REASONING_EFFORT = 'xhigh';
const OPENAI_COMPAT_MAX_COMPLETION_TOKENS = 180;

interface WorkersAIResult {
  response?: string;
}

interface OpenAICompatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
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
): Promise<LLMHeadlineResult> {
  const payload = [
    `交易日期: ${snapshot.tradeDate}`,
    `融资余额: ${snapshot.financingBalance}`,
    `融券余额: ${snapshot.securitiesLendingBalance}`,
    `两融余额: ${snapshot.marginBalanceTotal}`,
    `当日融资净买入: ${snapshot.financingNetBuy}`,
    `5日融资净买入: ${signal.financingNetBuy5d}`,
    `融资余额分位: ${signal.financingBalancePct250}`,
    `5日融资净买入分位: ${signal.financingNetBuy5dPct250}`,
    typeof snapshot.marketVolumeShares === 'number' ? `A股成交量: ${snapshot.marketVolumeShares}` : '',
    typeof signal.marketVolumePct250 === 'number' ? `A股成交量分位: ${signal.marketVolumePct250}` : '',
    `情绪标签: ${signal.sentimentLevel}`,
    `预警状态: ${signal.alertState}`,
    previousSnapshot ? `昨日融资余额: ${previousSnapshot.financingBalance}` : '',
    previousSnapshot ? `昨日融资净买入: ${previousSnapshot.financingNetBuy}` : '',
    typeof previousSnapshot?.marketVolumeShares === 'number' ? `昨日A股成交量: ${previousSnapshot.marketVolumeShares}` : '',
  ].filter(Boolean).join('\n');

  if (config.llmBaseUrl && config.llmApiKey) {
    try {
      return await summarizeWithOpenAICompatible(config, payload);
    } catch (error) {
      console.error('OpenAI-compatible LLM failed', error instanceof Error ? error.message : String(error));
    }
  }

  return summarizeWithWorkersAI(
    ai,
    config.llmModel.startsWith('@cf/') ? config.llmModel : DEFAULT_WORKERS_AI_MODEL,
    payload,
  );
}

async function summarizeWithOpenAICompatible(config: AppConfig, payload: string): Promise<LLMHeadlineResult> {
  const response = await fetch(`${config.llmBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llmApiKey}`,
    },
    body: JSON.stringify({
      model: config.llmModel,
      reasoning_effort: OPENAI_COMPAT_REASONING_EFFORT,
      max_completion_tokens: OPENAI_COMPAT_MAX_COMPLETION_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: payload },
      ],
      max_tokens: 120,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI-compatible HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  const result = await response.json() as OpenAICompatResponse;
  const rawContent = result.choices?.[0]?.message?.content;
  const content = typeof rawContent === 'string'
    ? rawContent.trim()
    : rawContent?.map((part) => part.text ?? '').join('').trim();
  if (!content) throw new Error('OpenAI-compatible response returned empty content');
  return {
    headline: normalizeHeadline(content),
    modelLabel: `${formatModelLabel(config.llmModel)} (${OPENAI_COMPAT_REASONING_EFFORT})`,
  };
}

async function summarizeWithWorkersAI(ai: Ai, model: string, payload: string): Promise<LLMHeadlineResult> {
  const result = await ai.run(model, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: payload },
    ],
    max_tokens: 120,
    temperature: 0.2,
  }) as WorkersAIResult;

  const content = result.response?.trim();
  if (!content) throw new Error('Workers AI returned empty response');
  return {
    headline: normalizeHeadline(content),
    modelLabel: formatModelLabel(model),
  };
}

function normalizeHeadline(content: string): string {
  return content.replace(/^[#\-\d.、\s]+/, '').split('\n')[0].trim();
}

function formatModelLabel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return 'Unknown';
  const slug = trimmed.replace(/^@cf\//, '').split('/').pop() ?? trimmed;
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === 'gpt') return 'GPT';
      if (lower === 'llama') return 'Llama';
      if (lower === 'qwen') return 'Qwen';
      if (lower === 'gemma') return 'Gemma';
      if (lower === 'glm') return 'GLM';
      if (lower === 'mistral') return 'Mistral';
      if (lower === 'kimi') return 'Kimi';
      if (lower === 'deepseek') return 'DeepSeek';
      if (lower === 'fp8') return 'FP8';
      if (lower === 'awq') return 'AWQ';
      if (lower === 'it') return 'IT';
      if (/^\d+(\.\d+)?b$/i.test(part)) return part.toUpperCase();
      if (/^\d+(\.\d+)?$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}
