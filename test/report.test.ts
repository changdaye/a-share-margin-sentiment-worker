import { describe, expect, it } from 'vitest';
import { buildDetailedReport, buildDetailedReportObjectKey } from '../src/lib/report';

describe('report helpers', () => {
  it('uses the project-prefixed UTC key', () => {
    expect(buildDetailedReportObjectKey(new Date('2026-04-24T01:02:03Z'))).toBe('a-share-margin-sentiment-worker/20260424010203.md');
  });

  it('includes source status, metrics, summary, and risks', () => {
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
        financingBalance: 180,
        securitiesLendingBalance: 5,
        marginBalanceTotal: 185,
        financingBuy: 17,
        financingRepay: 13,
        financingNetBuy: 4,
        rawPayloadJson: '{}',
      },
      signal: {
        tradeDate: '2026-04-23',
        financingBalancePct250: 96,
        financingNetBuy1dPct250: 92,
        financingNetBuy5d: 12,
        financingNetBuy5dPct250: 94,
        financingNetBuy10d: 20,
        lendingBalancePct250: 50,
        sentimentLevel: 'hot',
        alertState: 'overheat',
        summaryText: '市场偏热，杠杆情绪抬升。',
        metricsJson: '{}',
      },
    });

    expect(report).toContain('# A股两融情绪日报详细版');
    expect(report).toContain('## 数据来源情况');
    expect(report).toContain('## 核心指标');
    expect(report).toContain('## 风险与备注');
  });
});
