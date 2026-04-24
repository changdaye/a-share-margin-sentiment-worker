import type { MarketDailySnapshot, MarketSignal } from '../types';

const PREFIX = 'a-share-margin-sentiment-worker';

export function buildDetailedReportObjectKey(now = new Date()): string {
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('');
  return `${PREFIX}/${stamp}.md`;
}

export function buildDetailedReport(input: {
  generatedAt: Date;
  tradeDate: string;
  summary: string;
  reportUrl?: string;
  snapshot: MarketDailySnapshot;
  signal: MarketSignal;
}): string {
  const { generatedAt, tradeDate, summary, snapshot, signal } = input;
  return [
    '# A股两融情绪日报详细版',
    '',
    `- 生成时间: ${generatedAt.toISOString()}`,
    `- 交易日期: ${tradeDate}`,
    '',
    '## 数据来源情况',
    '',
    `- 上交所: ${snapshot.sseAvailable ? '成功' : '失败'}`,
    `- 深交所: ${snapshot.szseAvailable ? '成功' : '失败'}`,
    `- 东方财富兜底: ${snapshot.eastmoneyUsed ? '是' : '否'}`,
    `- 最终采用口径: ${snapshot.sourceStrategy}`,
    '',
    '## 今日核心结论',
    '',
    summary,
    '',
    '## 核心指标',
    '',
    `- 融资余额: ${snapshot.financingBalance}`,
    `- 融券余额: ${snapshot.securitiesLendingBalance}`,
    `- 两融余额: ${snapshot.marginBalanceTotal}`,
    `- 当日融资净买入: ${snapshot.financingNetBuy}`,
    `- 5日融资净买入: ${signal.financingNetBuy5d}`,
    `- 融资余额分位: ${signal.financingBalancePct250}`,
    `- 5日融资净买入分位: ${signal.financingNetBuy5dPct250}`,
    `- 情绪标签: ${signal.sentimentLevel}`,
    `- 预警状态: ${signal.alertState}`,
    '',
    '## 风险与备注',
    '',
    '- 第一版只覆盖全市场总览，不覆盖行业、宽基与个股。',
    '- 若交易所页面结构变化，官方数据可能降级为东方财富兜底。',
    '',
  ].join('\n');
}
