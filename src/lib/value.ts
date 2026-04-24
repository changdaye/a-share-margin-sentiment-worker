export function toInt(value: string | undefined, fallback: number, min: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}
