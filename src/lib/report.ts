import type { MarketDailySnapshot, MarketSignal } from '../types';

const PREFIX = 'a-share-margin-sentiment-worker';

const SENTIMENT_LABELS = {
  hot: '过热',
  warm: '偏热',
  neutral: '中性',
  cool: '偏冷',
  cold: '过冷',
} as const;

const ALERT_LABELS = {
  none: '无额外预警',
  overheat: '过热预警',
  cooling: '转冷预警',
} as const;

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
  previousSnapshot?: MarketDailySnapshot;
  signal: MarketSignal;
}): string {
  const { generatedAt, tradeDate, summary, snapshot, previousSnapshot, signal } = input;
  const financingShare = snapshot.marginBalanceTotal > 0
    ? ((snapshot.financingBalance / snapshot.marginBalanceTotal) * 100).toFixed(2)
    : '0.00';
  const lendingShare = snapshot.marginBalanceTotal > 0
    ? ((snapshot.securitiesLendingBalance / snapshot.marginBalanceTotal) * 100).toFixed(2)
    : '0.00';

  const lines = [
    '# A股两融情绪日报详细版',
    '',
    `- 生成时间: ${generatedAt.toISOString()}`,
    `- 交易日期: ${tradeDate}`,
    input.reportUrl ? `- 报告链接: ${input.reportUrl}` : undefined,
    '',
    '## 一、核心判断',
    '',
    summary,
    '',
    `- 情绪标签：${SENTIMENT_LABELS[signal.sentimentLevel]}`,
    `- 当前触发状态：${ALERT_LABELS[signal.alertState]}`,
    `- 融资余额历史分位：${formatPct(signal.financingBalancePct250)}`,
    `- 5日融资净买入历史分位：${formatPct(signal.financingNetBuy5dPct250)}`,
    '',
    '## 二、数据来源与采用口径',
    '',
    `- 上交所官方源：${snapshot.sseAvailable ? '成功' : '失败'}`,
    `- 深交所官方源：${snapshot.szseAvailable ? '成功' : '失败'}`,
    `- 东方财富兜底：${snapshot.eastmoneyUsed ? '已启用' : '未启用'}`,
    `- 最终采用口径：${sourceStrategyText(snapshot.sourceStrategy)}`,
    sourceNarrative(snapshot),
    '',
    '## 三、市场总览',
    '',
    '| 指标 | 数值 |',
    '| --- | --- |',
    `| 融资余额 | ${formatYi(snapshot.financingBalance)} |`,
    `| 融券余额 | ${formatYi(snapshot.securitiesLendingBalance)} |`,
    `| 两融余额 | ${formatYi(snapshot.marginBalanceTotal)} |`,
    `| 当日融资买入额 | ${formatYi(snapshot.financingBuy)} |`,
    `| 当日融资偿还额 | ${formatYi(snapshot.financingRepay)} |`,
    `| 当日融资净买入额 | ${formatYi(snapshot.financingNetBuy)} |`,
    `| 5日融资净买入累计 | ${formatYi(signal.financingNetBuy5d)} |`,
    `| 10日融资净买入累计 | ${formatYi(signal.financingNetBuy10d)} |`,
    `| 融资余额占两融余额比重 | ${financingShare}% |`,
    `| 融券余额占两融余额比重 | ${lendingShare}% |`,
    '',
    '## 四、今日 vs 昨日',
    '',
    previousSnapshot ? buildDayOverDayTable(snapshot, previousSnapshot) : '- 当前库中缺少昨日快照，因此暂不展示日环比对比。',
    '',
    '## 五、历史位置与预警解释',
    '',
    percentileNarrative(signal),
    '',
    alertNarrative(snapshot, signal),
    '',
    '## 六、观察与备注',
    '',
    '- 第一版只覆盖全市场总览，不覆盖行业、宽基与个股。',
    '- 若交易所页面结构变化，官方数据可能暂时降级为东方财富补位。',
    '- 融券指标在当前制度环境下更适合作为辅助解释项，不建议单独用于判断市场方向。',
    '- 若你看到日报显著偏热/偏冷，建议结合成交额、指数位置与后续几日融资净买入持续性一起判断。',
    '',
  ].filter((item): item is string => item !== undefined);

  return lines.join('\n');
}

function buildDayOverDayTable(today: MarketDailySnapshot, previous: MarketDailySnapshot): string {
  return [
    '| 指标 | 今日 | 昨日 | 变化 |',
    '| --- | --- | --- | --- |',
    `| 融资余额 | ${formatYi(today.financingBalance)} | ${formatYi(previous.financingBalance)} | ${formatDelta(today.financingBalance - previous.financingBalance)} |`,
    `| 融券余额 | ${formatYi(today.securitiesLendingBalance)} | ${formatYi(previous.securitiesLendingBalance)} | ${formatDelta(today.securitiesLendingBalance - previous.securitiesLendingBalance)} |`,
    `| 两融余额 | ${formatYi(today.marginBalanceTotal)} | ${formatYi(previous.marginBalanceTotal)} | ${formatDelta(today.marginBalanceTotal - previous.marginBalanceTotal)} |`,
    `| 当日融资买入额 | ${formatYi(today.financingBuy)} | ${formatYi(previous.financingBuy)} | ${formatDelta(today.financingBuy - previous.financingBuy)} |`,
    `| 当日融资偿还额 | ${formatYi(today.financingRepay)} | ${formatYi(previous.financingRepay)} | ${formatDelta(today.financingRepay - previous.financingRepay)} |`,
    `| 当日融资净买入额 | ${formatYi(today.financingNetBuy)} | ${formatYi(previous.financingNetBuy)} | ${formatDelta(today.financingNetBuy - previous.financingNetBuy)} |`,
  ].join('\n');
}

function formatYi(value: number): string {
  return `${(value / 1e8).toFixed(2)}亿元`;
}

function formatDelta(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value / 1e8).toFixed(2)}亿元`;
}

function formatPct(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

function sourceStrategyText(value: MarketDailySnapshot['sourceStrategy']): string {
  switch (value) {
    case 'official':
      return '交易所官方口径';
    case 'mixed':
      return '官方优先 + 东方财富补位';
    case 'fallback_eastmoney':
      return '东方财富聚合兜底';
  }
}

function sourceNarrative(snapshot: MarketDailySnapshot): string {
  if (snapshot.sourceStrategy === 'official') {
    return '- 当次日报完全由交易所官方数据拼接生成，未使用第三方聚合值。';
  }
  if (snapshot.sourceStrategy === 'mixed') {
    return '- 深交所官方源当次未成功获取，因此在保持官方优先的前提下，使用东方财富对缺口部分进行补位。';
  }
  return '- 当次日报未能拿到可用官方汇总，因此暂时使用东方财富聚合数据生成。';
}

function percentileNarrative(signal: MarketSignal): string {
  const parts = [
    `- 融资余额当前位于近似 ${formatPct(signal.financingBalancePct250)} 的历史分位，说明杠杆资金库存处在 ${positionText(signal.financingBalancePct250)}。`,
    `- 5日融资净买入位于近似 ${formatPct(signal.financingNetBuy5dPct250)} 的历史分位，说明短期杠杆增量处在 ${positionText(signal.financingNetBuy5dPct250)}。`,
  ];
  if (typeof signal.lendingBalancePct250 === 'number') {
    parts.push(`- 融券余额分位约为 ${formatPct(signal.lendingBalancePct250)}，当前更多作为辅助背景，不作为主判断依据。`);
  }
  return parts.join('\n');
}

function alertNarrative(snapshot: MarketDailySnapshot, signal: MarketSignal): string {
  if (signal.alertState === 'overheat') {
    return `- 当前触发“过热预警”，原因是融资余额与5日融资净买入同时处在高分位区。结合当日融资净买入 ${formatYi(snapshot.financingNetBuy)} 来看，杠杆情绪仍在向上堆积。`;
  }
  if (signal.alertState === 'cooling') {
    return `- 当前触发“转冷预警”，原因是5日融资净买入显著回落并落入低分位区，短期杠杆情绪明显降温。`;
  }
  return '- 当前未触发额外预警，说明虽然市场可能偏热或偏冷，但还未越过设定的额外提示阈值。';
}

function positionText(value: number): string {
  if (value >= 95) return '极高区';
  if (value >= 75) return '偏高区';
  if (value <= 10) return '极低区';
  if (value <= 25) return '偏低区';
  return '中性区';
}
