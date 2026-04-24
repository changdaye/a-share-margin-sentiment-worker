export function percentileRank(values: number[], value: number): number {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return 0;
  const lessOrEqual = finite.filter((item) => item <= value).length;
  return Number(((lessOrEqual / finite.length) * 100).toFixed(2));
}
