import type { AlertState, RuntimeState } from '../types';

export function buildDailyMessage(summary: string, reportUrl: string): string {
  return `${summary.trim()}\n\n详细版报告:\n${reportUrl}`;
}

export function buildAlertMessage(direction: Exclude<AlertState, 'none'>, reason: string, reportUrl: string): string {
  const title = direction === 'overheat' ? '两融过热预警' : '两融转冷预警';
  return `${title}\n触发原因: ${reason}\n\n详细版报告:\n${reportUrl}`;
}

export function buildHeartbeatMessage(state: RuntimeState, intervalHours: number): string {
  return [
    '💓 A股两融情绪日报 Worker 心跳',
    `心跳间隔: ${intervalHours}h`,
    `上次成功: ${state.lastSuccessAt ?? '无'}`,
    `连续失败: ${state.consecutiveFailures}`,
  ].join('\n');
}

export function buildFailureAlertMessage(state: RuntimeState, threshold: number): string {
  return [
    '🚨 A股两融情绪日报 Worker 异常告警',
    `连续失败: ${state.consecutiveFailures}`,
    `告警阈值: ${threshold}`,
    `最近错误: ${state.lastError ?? 'unknown'}`,
  ].join('\n');
}
