import { describe, expect, it } from 'vitest';
import { buildAlertMessage, buildDailyMessage, buildHeartbeatMessage, buildFailureAlertMessage } from '../src/lib/message';

describe('message helpers', () => {
  it('appends the detailed report link using the required two-line format', () => {
    const text = buildDailyMessage('市场情绪偏热。', 'https://cos.example/report.md');
    expect(text).toContain('详细版报告:\nhttps://cos.example/report.md');
    expect(text).not.toContain('时间:');
  });

  it('formats alert, heartbeat, and failure messages', () => {
    expect(buildAlertMessage('overheat', '融资余额分位过高', 'https://cos.example/report.md')).toContain('详细版报告:');
    expect(buildHeartbeatMessage({ consecutiveFailures: 0, lastSuccessAt: '2026-04-24T09:00:00Z' }, 24)).toContain('心跳');
    expect(buildFailureAlertMessage({ consecutiveFailures: 2, lastError: 'boom' }, 1)).toContain('连续失败');
  });
});
