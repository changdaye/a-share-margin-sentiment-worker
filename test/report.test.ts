import { describe, expect, it } from 'vitest';
import { buildDetailedReport, buildDetailedReportObjectKey } from '../src/lib/report';

describe('report helpers', () => {
  it('uses the project-prefixed UTC key', () => {
    expect(buildDetailedReportObjectKey(new Date('2026-04-24T01:02:03Z'))).toBe('a-share-margin-sentiment-worker/20260424010203.md');
  });

  it('includes richer sections, formatted metrics, alert reasoning, and day-over-day comparison', () => {
    const report = buildDetailedReport({
      generatedAt: new Date('2026-04-24T01:02:03Z'),
      tradeDate: '2026-04-23',
      summary: '杠杆资金延续升温，盘后情绪仍偏热。',
      reportUrl: 'https://cos.example/report.md',
      snapshot: {
        tradeDate: '2026-04-23',
        sourceStrategy: 'mixed',
        sseAvailable: true,
        szseAvailable: false,
        eastmoneyUsed: true,
        financingBalance: 2695768367122,
        securitiesLendingBalance: 20044043633,
        marginBalanceTotal: 2715812410755,
        financingBuy: 282232708850,
        financingRepay: 267449439983,
        financingNetBuy: 14783268867,
        rawPayloadJson: '{}',
      },
      previousSnapshot: {
        tradeDate: '2026-04-22',
        sourceStrategy: 'mixed',
        sseAvailable: true,
        szseAvailable: false,
        eastmoneyUsed: true,
        financingBalance: 2691968846032,
        securitiesLendingBalance: 20232731678,
        marginBalanceTotal: 2712201577710,
        financingBuy: 262586055248,
        financingRepay: 258598346154,
        financingNetBuy: 3987709094,
        rawPayloadJson: '{}',
      },
      signal: {
        tradeDate: '2026-04-23',
        financingBalancePct250: 96,
        financingNetBuy1dPct250: 92,
        financingNetBuy5d: 41200000000,
        financingNetBuy5dPct250: 94,
        financingNetBuy10d: 63500000000,
        lendingBalancePct250: 50,
        sentimentLevel: 'hot',
        alertState: 'overheat',
        summaryText: '杠杆资金延续升温，盘后情绪仍偏热。',
        metricsJson: '{}',
      },
    });

    expect(report).toContain('## 一、核心判断');
    expect(report).toContain('## 二、数据来源与采用口径');
    expect(report).toContain('## 三、市场总览');
    expect(report).toContain('## 四、今日 vs 昨日');
    expect(report).toContain('## 五、历史位置与预警解释');
    expect(report).toContain('## 六、观察与备注');
    expect(report).toContain('| 指标 | 今日 | 昨日 | 变化 |');
    expect(report).toContain('26957.68亿元');
    expect(report).toContain('深交所官方源当次未成功获取');
    expect(report).toContain('当前触发状态：过热预警');
  });
});
