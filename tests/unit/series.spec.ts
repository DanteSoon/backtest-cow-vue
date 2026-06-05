import { describe, expect, it } from 'vitest'
import { alignFxRate, findFirstTradingDateOnOrAfter } from '@/shared/utils/series'

describe('series utils', () => {
  it('alignFxRate should use latest prior fx point', () => {
    const fx = [
      { date: '2024-01-01', usdCny: 7.1 },
      { date: '2024-01-03', usdCny: 7.2 },
    ]
    expect(alignFxRate('2024-01-02', fx).usdCny).toBe(7.1)
    expect(alignFxRate('2024-01-03', fx).usdCny).toBe(7.2)
  })

  it('findFirstTradingDateOnOrAfter should shift to next trading day', () => {
    const series = [
      { date: '2024-01-02', open: 99, high: 101, low: 98, close: 100, volume: 1000 },
      { date: '2024-01-05', open: 101, high: 103, low: 100, close: 102, volume: 1200 },
    ]
    expect(findFirstTradingDateOnOrAfter('2024-01-03', series)?.date).toBe('2024-01-05')
  })
})
