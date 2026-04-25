import type { MarketDailySnapshot, MarketSignal } from '../types';

export interface MetricComparisonRow {
  label: string;
  currentText: string;
  previousText?: string;
  previousChangeText?: string;
  medianText: string;
  medianChangeText: string;
  monthAverageText: string;
  monthAverageChangeText: string;
}

interface NumericMetricDefinition {
  label: string;
  currentValue: number | undefined;
  previousValue: number | undefined;
  historicalValues: number[];
  monthValues: number[];
  formatValue: (value: number) => string;
}

export function buildMetricComparisonRows(input: {
  snapshot: MarketDailySnapshot;
  signal: MarketSignal;
  historicalSnapshots: MarketDailySnapshot[];
  previousSnapshot?: MarketDailySnapshot;
}): MetricComparisonRow[] {
  const historicalSnapshots = [...input.historicalSnapshots]
    .filter((row) => row.tradeDate !== input.snapshot.tradeDate)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const monthPrefix = input.snapshot.tradeDate.slice(0, 7);
  const monthSnapshots = [...historicalSnapshots, input.snapshot]
    .filter((row) => row.tradeDate.startsWith(monthPrefix))
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

  const historicalNetBuy5dSeries = buildRollingSeries(historicalSnapshots.map((row) => row.financingNetBuy), 5);
  const monthNetBuy5dSeries = buildRollingSeries(monthSnapshots.map((row) => row.financingNetBuy), 5);

  return [
    {
      label: '融资余额',
      currentValue: input.snapshot.financingBalance,
      previousValue: input.previousSnapshot?.financingBalance,
      historicalValues: historicalSnapshots.map((row) => row.financingBalance),
      monthValues: monthSnapshots.map((row) => row.financingBalance),
      formatValue: formatYi,
    },
    {
      label: '当日融资净买入',
      currentValue: input.snapshot.financingNetBuy,
      previousValue: input.previousSnapshot?.financingNetBuy,
      historicalValues: historicalSnapshots.map((row) => row.financingNetBuy),
      monthValues: monthSnapshots.map((row) => row.financingNetBuy),
      formatValue: formatYi,
    },
    {
      label: '5日融资净买入累计',
      currentValue: input.signal.financingNetBuy5d,
      previousValue: undefined,
      historicalValues: historicalNetBuy5dSeries,
      monthValues: monthNetBuy5dSeries,
      formatValue: formatYi,
    },
    {
      label: 'A股成交量',
      currentValue: input.snapshot.marketVolumeShares,
      previousValue: input.previousSnapshot?.marketVolumeShares,
      historicalValues: historicalSnapshots
        .map((row) => row.marketVolumeShares)
        .filter((value): value is number => typeof value === 'number'),
      monthValues: monthSnapshots
        .map((row) => row.marketVolumeShares)
        .filter((value): value is number => typeof value === 'number'),
      formatValue: formatYiShares,
    },
  ]
    .map((metric) => buildMetricComparisonRow(metric))
    .filter((row): row is MetricComparisonRow => Boolean(row));
}

export function buildComparisonNarrative(rows: MetricComparisonRow[]): string | undefined {
  const preferredLabels = new Set(['融资余额', '当日融资净买入', 'A股成交量']);
  const selectedRows = rows.filter((row) => preferredLabels.has(row.label));
  if (!selectedRows.length) return undefined;

  return selectedRows.map((row) => describeRow(row)).join('\n');
}

function buildMetricComparisonRow(metric: NumericMetricDefinition): MetricComparisonRow | undefined {
  if (typeof metric.currentValue !== 'number') return undefined;

  const medianValue = median(metric.historicalValues);
  const monthAverageValue = average(metric.monthValues);
  if (typeof medianValue !== 'number' || typeof monthAverageValue !== 'number') return undefined;

  return {
    label: metric.label,
    currentText: metric.formatValue(metric.currentValue),
    previousText: typeof metric.previousValue === 'number' ? metric.formatValue(metric.previousValue) : undefined,
    previousChangeText: typeof metric.previousValue === 'number' ? formatRelativeChangeText(metric.currentValue, metric.previousValue) : undefined,
    medianText: metric.formatValue(medianValue),
    medianChangeText: formatRelativeChangeText(metric.currentValue, medianValue),
    monthAverageText: metric.formatValue(monthAverageValue),
    monthAverageChangeText: formatRelativeChangeText(metric.currentValue, monthAverageValue),
  };
}

function describeRow(row: MetricComparisonRow): string {
  return `${rowTone(row)} ${row.label} ${row.currentText}${row.previousChangeText ? `｜昨 ${toCompactChange(row.previousChangeText)}` : ''}｜中位数 ${toCompactChange(row.medianChangeText)}｜本月均值 ${toCompactChange(row.monthAverageChangeText)}`;
}

function rowTone(row: MetricComparisonRow): string {
  const medianDirection = changeDirection(row.medianChangeText);
  const monthDirection = changeDirection(row.monthAverageChangeText);
  if (medianDirection === 'up' && monthDirection === 'up') return '🟥';
  if (medianDirection === 'down' && monthDirection === 'down') return '🟩';
  if (medianDirection === 'flat' && monthDirection === 'flat') return '⬜️';
  return '🟨';
}

function changeDirection(changeText: string): 'up' | 'down' | 'flat' | 'mixed' {
  if (changeText.startsWith('增加')) return 'up';
  if (changeText.startsWith('减少')) return 'down';
  if (changeText.startsWith('持平')) return 'flat';
  return 'mixed';
}

function toCompactChange(changeText: string): string {
  if (changeText.startsWith('增加 ')) return `↗ ${changeText.slice(3)}`;
  if (changeText.startsWith('减少 ')) return `↘ ${changeText.slice(3)}`;
  if (changeText === '持平') return '→ 持平';
  return `↕ ${changeText}`;
}

export function formatRelativeChangeText(current: number, reference: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(reference)) return '暂无可比口径';
  if (current === reference) return '持平';
  if (reference === 0) {
    return current > 0 ? '由零值转为正值' : '由零值转为负值';
  }

  const pct = `${Math.abs(((current - reference) / Math.abs(reference)) * 100).toFixed(2)}%`;
  if (reference < 0 && current > 0) return `由负转正（幅度 ${pct}）`;
  if (reference > 0 && current < 0) return `由正转负（幅度 ${pct}）`;
  return current > reference ? `增加 ${pct}` : `减少 ${pct}`;
}

function buildRollingSeries(values: number[], windowSize: number): number[] {
  return values.map((_, index) => sumLast(values.slice(0, index + 1), windowSize));
}

function sumLast(values: number[], count: number): number {
  return values.slice(-count).reduce((sum, value) => sum + value, 0);
}

function average(values: number[]): number | undefined {
  const finiteValues = values.filter(Number.isFinite);
  if (!finiteValues.length) return undefined;
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function median(values: number[]): number | undefined {
  const finiteValues = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finiteValues.length) return undefined;
  const middle = Math.floor(finiteValues.length / 2);
  if (finiteValues.length % 2 === 1) return finiteValues[middle];
  return (finiteValues[middle - 1] + finiteValues[middle]) / 2;
}

function formatYi(value: number): string {
  return `${(value / 1e8).toFixed(2)}亿元`;
}

function formatYiShares(value: number): string {
  return `${(value / 1e8).toFixed(2)}亿股`;
}
