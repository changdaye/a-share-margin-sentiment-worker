import { buildMetricComparisonRows, formatRelativeChangeText } from './comparison';
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMultilineText(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br />');
}

function listHtml(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${formatMultilineText(item)}</li>`).join('')}</ul>`;
}

export function buildDetailedReportObjectKey(now = new Date()): string {
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('');
  return `${PREFIX}/${stamp}.html`;
}

export function buildDetailedReport(input: {
  generatedAt: Date;
  tradeDate: string;
  summary: string;
  reportUrl?: string;
  snapshot: MarketDailySnapshot;
  previousSnapshot?: MarketDailySnapshot;
  historicalSnapshots?: MarketDailySnapshot[];
  signal: MarketSignal;
}): string {
  const { generatedAt, tradeDate, summary, snapshot, previousSnapshot, signal } = input;
  const financingShare = snapshot.marginBalanceTotal > 0
    ? ((snapshot.financingBalance / snapshot.marginBalanceTotal) * 100).toFixed(2)
    : '0.00';
  const lendingShare = snapshot.marginBalanceTotal > 0
    ? ((snapshot.securitiesLendingBalance / snapshot.marginBalanceTotal) * 100).toFixed(2)
    : '0.00';
  const comparisonRows = buildMetricComparisonRows({
    snapshot,
    signal,
    historicalSnapshots: input.historicalSnapshots ?? [],
  });

  const sourceItems = [
    `上交所官方源：${snapshot.sseAvailable ? '成功' : '失败'}`,
    `深交所官方源：${snapshot.szseAvailable ? '成功' : '失败'}`,
    `东方财富兜底：${snapshot.eastmoneyUsed ? '已启用' : '未启用'}`,
    `最终采用口径：${sourceStrategyText(snapshot.sourceStrategy)}`,
    sourceNarrative(snapshot),
    snapshot.marketVolumeShares ? 'A股成交量：补充使用腾讯公开A股指数日线（上证A股指数 + 深证A指）估算。' : undefined,
  ].filter((item): item is string => item !== undefined);

  const marketRows = [
    ['融资余额', formatYi(snapshot.financingBalance)],
    ['融券余额', formatYi(snapshot.securitiesLendingBalance)],
    ['两融余额', formatYi(snapshot.marginBalanceTotal)],
    ['当日融资买入额', formatYi(snapshot.financingBuy)],
    ['当日融资偿还额', formatYi(snapshot.financingRepay)],
    ['当日融资净买入额', formatYi(snapshot.financingNetBuy)],
    ['5日融资净买入累计', formatYi(signal.financingNetBuy5d)],
    ['10日融资净买入累计', formatYi(signal.financingNetBuy10d)],
    ...(snapshot.marketVolumeShares ? [['A股成交量', formatYiShares(snapshot.marketVolumeShares)]] as Array<[string, string]> : []),
    ['融资余额占两融余额比重', `${financingShare}%`],
    ['融券余额占两融余额比重', `${lendingShare}%`],
  ];

  const historyItems = percentileNarrative(signal).split('\n').filter(Boolean);
  const noteItems = [
    '第一版只覆盖全市场总览，不覆盖行业、宽基与个股。',
    '若交易所页面结构变化，官方数据可能暂时降级为东方财富补位。',
    '融券指标在当前制度环境下更适合作为辅助解释项，不建议单独用于判断市场方向。',
    '若你看到日报显著偏热/偏冷，建议结合成交额、指数位置与后续几日融资净买入持续性一起判断。',
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A股两融情绪日报详细版</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; margin: 0; background: #f5f7fb; color: #111827; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 20px 48px; }
    .card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); margin-bottom: 20px; }
    h1, h2 { margin-top: 0; }
    .meta { color: #64748b; line-height: 1.9; }
    .headline { font-size: 18px; font-weight: 700; line-height: 1.8; }
    .kv-list { line-height: 1.9; margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; font-weight: 700; }
    ul { margin: 0; padding-left: 20px; line-height: 1.9; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>A股两融情绪日报详细版</h1>
      <div class="meta">
        <div><strong>生成时间：</strong>${escapeHtml(generatedAt.toISOString())}</div>
        <div><strong>交易日期：</strong>${escapeHtml(tradeDate)}</div>
        ${input.reportUrl ? `<div><strong>报告链接：</strong><a href="${escapeHtml(input.reportUrl)}">${escapeHtml(input.reportUrl)}</a></div>` : ''}
      </div>
    </section>

    <section class="card">
      <h2>一、核心判断</h2>
      <div class="headline">${formatMultilineText(summary)}</div>
      <div class="kv-list">
        <div>情绪标签：${escapeHtml(SENTIMENT_LABELS[signal.sentimentLevel])}</div>
        <div>当前触发状态：${escapeHtml(ALERT_LABELS[signal.alertState])}</div>
        <div>融资余额历史分位：${escapeHtml(formatPct(signal.financingBalancePct250))}</div>
        <div>5日融资净买入历史分位：${escapeHtml(formatPct(signal.financingNetBuy5dPct250))}</div>
      </div>
    </section>

    <section class="card">
      <h2>二、数据来源与采用口径</h2>
      ${listHtml(sourceItems)}
    </section>

    <section class="card">
      <h2>三、市场总览</h2>
      <table>
        <thead><tr><th>指标</th><th>数值</th></tr></thead>
        <tbody>${marketRows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody>
      </table>
    </section>

    <section class="card">
      <h2>四、今日 vs 昨日</h2>
      ${previousSnapshot ? buildDayOverDayTable(snapshot, previousSnapshot) : '<p>当前库中缺少昨日快照，因此暂不展示日环比对比。</p>'}
    </section>

    <section class="card">
      <h2>五、今日 vs 历史中位数 / 本月均值</h2>
      ${comparisonRows.length > 0 ? buildMedianAndMonthlyTable(comparisonRows) : '<p>当前库中可用历史不足，暂不展示历史中位数与本月均值对比。</p>'}
    </section>

    <section class="card">
      <h2>六、历史位置与预警解释</h2>
      ${listHtml(historyItems)}
      <p>${formatMultilineText(alertNarrative(snapshot, signal))}</p>
    </section>

    <section class="card">
      <h2>七、观察与备注</h2>
      ${listHtml(noteItems)}
    </section>
  </div>
</body>
</html>`;
}

function buildDayOverDayTable(today: MarketDailySnapshot, previous: MarketDailySnapshot): string {
  const rows = [
    ['融资余额', formatYi(today.financingBalance), formatYi(previous.financingBalance), formatRelativeChangeText(today.financingBalance, previous.financingBalance)],
    ['融券余额', formatYi(today.securitiesLendingBalance), formatYi(previous.securitiesLendingBalance), formatRelativeChangeText(today.securitiesLendingBalance, previous.securitiesLendingBalance)],
    ['两融余额', formatYi(today.marginBalanceTotal), formatYi(previous.marginBalanceTotal), formatRelativeChangeText(today.marginBalanceTotal, previous.marginBalanceTotal)],
    ['当日融资买入额', formatYi(today.financingBuy), formatYi(previous.financingBuy), formatRelativeChangeText(today.financingBuy, previous.financingBuy)],
    ['当日融资偿还额', formatYi(today.financingRepay), formatYi(previous.financingRepay), formatRelativeChangeText(today.financingRepay, previous.financingRepay)],
    ['当日融资净买入额', formatYi(today.financingNetBuy), formatYi(previous.financingNetBuy), formatRelativeChangeText(today.financingNetBuy, previous.financingNetBuy)],
  ] as Array<[string, string, string, string]>;

  if (typeof today.marketVolumeShares === 'number' && typeof previous.marketVolumeShares === 'number') {
    rows.push(['A股成交量', formatYiShares(today.marketVolumeShares), formatYiShares(previous.marketVolumeShares), formatRelativeChangeText(today.marketVolumeShares, previous.marketVolumeShares)]);
  }

  return `<table>
    <thead><tr><th>指标</th><th>今日</th><th>昨日</th><th>变化</th></tr></thead>
    <tbody>${rows.map(([label, current, previousValue, delta]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(current)}</td><td>${escapeHtml(previousValue)}</td><td>${escapeHtml(delta)}</td></tr>`).join('')}</tbody>
  </table>`;
}

function buildMedianAndMonthlyTable(rows: ReturnType<typeof buildMetricComparisonRows>): string {
  return `<table>
    <thead><tr><th>指标</th><th>今日</th><th>历史中位数</th><th>较中位数</th><th>本月均值</th><th>较本月均值</th></tr></thead>
    <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.currentText)}</td><td>${escapeHtml(row.medianText)}</td><td>${escapeHtml(row.medianChangeText)}</td><td>${escapeHtml(row.monthAverageText)}</td><td>${escapeHtml(row.monthAverageChangeText)}</td></tr>`).join('')}</tbody>
  </table>`;
}

function formatYi(value: number): string {
  return `${(value / 1e8).toFixed(2)}亿元`;
}

function formatPct(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

function formatYiShares(value: number): string {
  return `${(value / 1e8).toFixed(2)}亿股`;
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
  if (typeof signal.marketVolumePct250 === 'number') {
    parts.push(`- A股成交量分位约为 ${formatPct(signal.marketVolumePct250)}，说明交投活跃度处在 ${positionText(signal.marketVolumePct250)}。`);
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
