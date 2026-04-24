import { describe, expect, it } from 'vitest';
import { formatDateInZone } from '../src/lib/time';

describe('formatDateInZone', () => {
  it('formats a Shanghai date string', () => {
    expect(formatDateInZone(new Date('2026-04-24T09:00:00Z'), 'Asia/Shanghai')).toBe('2026-04-24');
  });
});
