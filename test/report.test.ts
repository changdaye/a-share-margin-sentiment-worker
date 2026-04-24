import { describe, expect, it } from 'vitest';
import { buildDetailedReport, buildDetailedReportObjectKey } from '../src/lib/report';

describe('report helpers', () => {
  it('uses the project-prefixed UTC key', () => {
    expect(buildDetailedReportObjectKey(new Date('2026-04-24T01:02:03Z'))).toBe('a-share-margin-sentiment-worker/20260424010203.md');
  });

  it('includes richer sections, formatted metrics, and alert reasoning', () => {
    const report = buildDetailedReport({
      generatedAt: new Date('2026-04-24T01:02:03Z'),
      tradeDate: '2026-04-23',
      summary: '市场偏热，杠杆情绪抬升。',
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
        summaryText: '市场偏热，杠杆情绪抬升。',
        metricsJson: '{}',
      },
    });

    expect(report).toContain('# A股两融情绪日报详细版');
    expect(report).toContain('## 一、核心判断');
    expect(report).toContain('## 二、数据来源与采用口径');
    expect(report).toContain('## 三、市场总览');
    expect(report).toContain('## 四、历史位置与预警解释');
    expect(report).toContain('## 五、观察与备注');
    expect(report).toContain('| 指标 | 数值 |');
    expect(report).toContain('融资余额');
    expect(report).toContain('26957.68亿元');
    expect(report).toContain('当前触发状态：过热预警');
    expect(report).toContain('深交所官方源当次未成功获取');
  });
});
