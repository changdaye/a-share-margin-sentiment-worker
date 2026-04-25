import { describe, expect, it } from 'vitest';
import { buildAlertMessage, buildDailyMessage, buildFailureAlertMessage, buildHeartbeatMessage } from '../src/lib/message';

describe('message helpers', () => {
  it('appends the detailed report link using the required two-line format', () => {
    const text = buildDailyMessage('今天两融情绪偏热。\n融资净买入明显走强。\n关注后续持续性。', 'https://cos.example/report.html');
    expect(text).toContain('详细版报告:\nhttps://cos.example/report.html');
    expect(text).not.toContain('时间:');
    expect(text).toContain('今天两融情绪偏热。\n融资净买入明显走强。\n关注后续持续性。');
  });

  it('normalizes single-paragraph text into multiple lines', () => {
    const text = buildDailyMessage('今天两融情绪偏热。融资净买入明显走强。关注后续持续性。', 'https://cos.example/report.html');
    expect(text).toContain('今天两融情绪偏热。\n融资净买入明显走强。\n关注后续持续性。');
  });

  it('formats alert, heartbeat, and failure messages', () => {
    expect(buildAlertMessage('overheat', '融资余额分位过高。5日融资净买入分位过高。', 'https://cos.example/report.html')).toContain('详细版报告:');
    expect(buildAlertMessage('overheat', '融资余额分位过高。5日融资净买入分位过高。', 'https://cos.example/report.html')).toContain('融资余额分位过高。\n5日融资净买入分位过高。');
    expect(buildHeartbeatMessage({ consecutiveFailures: 0, lastSuccessAt: '2026-04-24T09:00:00Z' }, 24)).toContain('心跳');
    expect(buildFailureAlertMessage({ consecutiveFailures: 2, lastError: 'boom' }, 1)).toContain('连续失败');
  });
});
