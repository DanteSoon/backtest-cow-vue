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
      {
        seriesByCode: {
          NDX: series,
        },
        currencyByCode: {
          NDX: 'CNY',
        },
      },
      [{ date: '2024-01-02', usdCny: 1 }],
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

  it('supports dca portfolio with ratio allocation and resolved date range', () => {
    const result = runBacktestEngine(
      {
        kind: 'dca',
        portfolio: [
          { indexCode: 'NDX', ratio: 60, amountCny: 0 },
          { indexCode: 'CSI300', ratio: 40, amountCny: 0 },
        ],
        allocationMode: 'ratio',
        dateMode: 'start-duration',
        startDate: '2024-01-02',
        endDate: '2024-12-31',
        durationYears: 1,
        recentYears: 1,
        periodicTotalAmountCny: 1000,
        frequency: 'monthly',
        feeRate: 0,
        feeFixed: 0,
        slippageBps: 0,
      },
      {
        seriesByCode: {
          NDX: series,
          CSI300: series.map((item) => ({ ...item, close: item.close * 2 })),
        },
        currencyByCode: {
          NDX: 'CNY',
          CSI300: 'CNY',
        },
      },
      [{ date: '2024-01-02', usdCny: 1 }],
    )

    expect(result.summary.tradeCount).toBeGreaterThan(0)
    expect(result.assetSummaries).toHaveLength(2)
    expect(result.resolvedRange.startDate).toBe('2024-01-02')
    expect(result.resolvedRange.label).toContain('持续 1 年')
  })

  it('supports dca portfolio with amount allocation and end-recent date mode', () => {
    const extendedSeries = [
      { date: '2022-01-03', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { date: '2022-12-30', open: 110, high: 111, low: 109, close: 110, volume: 1000 },
      { date: '2023-12-29', open: 120, high: 121, low: 119, close: 120, volume: 1000 },
      { date: '2024-12-31', open: 130, high: 131, low: 129, close: 130, volume: 1000 },
    ]

    const result = runBacktestEngine(
      {
        kind: 'dca',
        portfolio: [
          { indexCode: 'NDX', ratio: 0, amountCny: 600 },
          { indexCode: 'CSI300', ratio: 0, amountCny: 400 },
        ],
        allocationMode: 'amount',
        dateMode: 'end-recent',
        startDate: '2022-01-03',
        endDate: '2024-12-31',
        durationYears: 3,
        recentYears: 2,
        periodicTotalAmountCny: 0,
        frequency: 'monthly',
        feeRate: 0,
        feeFixed: 0,
        slippageBps: 0,
      },
      {
        seriesByCode: {
          NDX: extendedSeries,
          CSI300: extendedSeries.map((item) => ({ ...item, close: item.close * 0.8 })),
        },
        currencyByCode: {
          NDX: 'CNY',
          CSI300: 'CNY',
        },
      },
      [{ date: '2022-01-03', usdCny: 1 }],
    )

    expect(result.summary.tradeCount).toBeGreaterThan(0)
    expect(result.summary.totalInvestedCny).toBeGreaterThan(0)
    expect(result.assetSummaries).toHaveLength(2)
    expect(result.resolvedRange.endDate).toBe('2024-12-31')
    expect(result.resolvedRange.label).toContain('回看近 2 年')
  })
})
