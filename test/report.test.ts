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
        marketVolumeShares: 131393668700,
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
        marketVolumeShares: 120000000000,
        rawPayloadJson: '{}',
      },
      historicalSnapshots: [
        {
          tradeDate: '2026-04-01',
          sourceStrategy: 'mixed',
          sseAvailable: true,
          szseAvailable: false,
          eastmoneyUsed: true,
          financingBalance: 2500000000000,
          securitiesLendingBalance: 18000000000,
          marginBalanceTotal: 2518000000000,
          financingBuy: 180000000000,
          financingRepay: 175000000000,
          financingNetBuy: 5000000000,
          marketVolumeShares: 100000000000,
          rawPayloadJson: '{}',
        },
        {
          tradeDate: '2026-04-10',
          sourceStrategy: 'mixed',
          sseAvailable: true,
          szseAvailable: false,
          eastmoneyUsed: true,
          financingBalance: 2600000000000,
          securitiesLendingBalance: 19000000000,
          marginBalanceTotal: 2619000000000,
          financingBuy: 210000000000,
          financingRepay: 205000000000,
          financingNetBuy: 5000000000,
          marketVolumeShares: 110000000000,
          rawPayloadJson: '{}',
        },
        {
          tradeDate: '2026-04-15',
          sourceStrategy: 'mixed',
          sseAvailable: true,
          szseAvailable: false,
          eastmoneyUsed: true,
          financingBalance: 2650000000000,
          securitiesLendingBalance: 19500000000,
          marginBalanceTotal: 2669500000000,
          financingBuy: 220000000000,
          financingRepay: 212000000000,
          financingNetBuy: 8000000000,
          marketVolumeShares: 115000000000,
          rawPayloadJson: '{}',
        },
        {
          tradeDate: '2026-04-21',
          sourceStrategy: 'mixed',
          sseAvailable: true,
          szseAvailable: false,
          eastmoneyUsed: true,
          financingBalance: 2680000000000,
          securitiesLendingBalance: 19800000000,
          marginBalanceTotal: 2699800000000,
          financingBuy: 240000000000,
          financingRepay: 235000000000,
          financingNetBuy: 5000000000,
          marketVolumeShares: 118000000000,
          rawPayloadJson: '{}',
        },
        {
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
          marketVolumeShares: 120000000000,
          rawPayloadJson: '{}',
        },
      ],
      signal: {
        tradeDate: '2026-04-23',
        financingBalancePct250: 96,
        financingNetBuy1dPct250: 92,
        financingNetBuy5d: 41200000000,
        financingNetBuy5dPct250: 94,
        financingNetBuy10d: 63500000000,
        lendingBalancePct250: 50,
        marketVolumePct250: 82,
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
    expect(report).toContain('## 五、今日 vs 历史中位数 / 本月均值');
    expect(report).toContain('## 六、历史位置与预警解释');
    expect(report).toContain('## 七、观察与备注');
    expect(report).toContain('| 指标 | 今日 | 昨日 | 变化 |');
    expect(report).toContain('| 指标 | 今日 | 历史中位数 | 较中位数 | 本月均值 | 较本月均值 |');
    expect(report).toContain('26957.68亿元');
    expect(report).toContain('1313.94亿股');
    expect(report).toContain('深交所官方源当次未成功获取');
    expect(report).toContain('当前触发状态：过热预警');
    expect(report).toContain('A股成交量分位约为 82%');
    expect(report).toContain('26500.00亿元');
    expect(report).toContain('增加 1.73%');
    expect(report).toContain('1157.32亿股');
    expect(report).toContain('增加 2.26%');
    expect(report).toContain('增加 14.26%');
    expect(report).toContain('增加 0.14%');
    expect(report).toContain('增加 9.49%');
  });
});
