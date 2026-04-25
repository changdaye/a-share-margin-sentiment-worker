import { describe, expect, it } from 'vitest';
import { parseAshareMarketVolumeSnapshot } from '../src/services/a-share-volume';

describe('parseAshareMarketVolumeSnapshot', () => {
  it('sums the Shanghai and Shenzhen A-share index volumes into share units', () => {
    const result = parseAshareMarketVolumeSnapshot({
      tradeDate: '2026-04-24',
      sseVolumeLots: 604375690,
      szseVolumeLots: 709560997,
    });

    expect(result.tradeDate).toBe('2026-04-24');
    expect(result.marketVolumeShares).toBe(131393668700);
    expect(result.rawPayload).toEqual({
      tradeDate: '2026-04-24',
      sseVolumeLots: 604375690,
      szseVolumeLots: 709560997,
      totalVolumeLots: 1313936687,
    });
  });
});
