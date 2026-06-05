import { describe, expect, it } from 'vitest'
import { runBacktestEngine } from '@/shared/utils/backtest-engine'

const series = [
  { date: '2024-01-02', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
  { date: '2024-01-03', open: 99, high: 100, low: 90, close: 90, volume: 1000 },
  { date: '2024-01-04', open: 91, high: 92, low: 80, close: 80, volume: 1000 },
  { date: '2024-01-05', open: 95, high: 110, low: 95, close: 110, volume: 1000 },
]

describe('backtest engine', () => {
  it('computes max drawdown, recovery, and benchmark series for manual strategy', () => {
    const result = runBacktestEngine(
      {
        kind: 'manual',
        indexCode: 'NDX',
        initialCashCny: 1000,
        feeRate: 0,
        feeFixed: 0,
        slippageBps: 0,
        trades: [
          {
            date: '2024-01-02',
            side: 'buy',
            valueMode: 'cash',
            value: 1000,
            feeRate: 0,
            feeFixed: 0,
            slippageBps: 0,
          },
        ],
      },
      series,
      [{ date: '2024-01-02', usdCny: 1 }],
      'CNY',
    )

    expect(result.curve.length).toBe(1)
    expect(result.summary.tradeCount).toBe(1)
    expect(result.summary.maxDrawdown).toBe(0)
    expect(result.summary.maxDrawdownEndDate).toBeNull()
    expect(result.summary.maxDrawdownRecoveryDate).toBeNull()
    expect(result.benchmarkCurve.length).toBe(1)
    expect(result.excessReturnCurve.length).toBe(1)
    expect(result.yearly[0]?.year).toBe(2024)
  })
})
