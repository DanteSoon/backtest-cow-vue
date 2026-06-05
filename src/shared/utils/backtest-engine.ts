import dayjs from 'dayjs'
import type {
  BacktestCurvePoint,
  BacktestParams,
  BacktestResult,
  BenchmarkCurvePoint,
  DcaParams,
  ExecutedTrade,
  ExcessReturnPoint,
  FxPoint,
  HoldingMetricPoint,
  ManualParams,
  PricePoint,
  RiskMetrics,
  YearlyMetric,
} from '@/shared/types/domain'
import { alignFxRate, findFirstTradingDateOnOrAfter, sortByDate } from '@/shared/utils/series'
import { calculateXirr } from '@/shared/utils/xirr'

interface CurveBuildPoint {
  date: string
  investedCny: number
  valueCny: number
  cashCny: number
  holdingsValueCny: number
  dailyFlowCny: number
}

interface CurveBuildResult {
  curve: CurveBuildPoint[]
  trades: ExecutedTrade[]
}

const applyBuyCost = (value: number, feeRate: number, feeFixed: number, slippageBps: number) =>
  value * (1 - feeRate) - feeFixed - value * (slippageBps / 10_000)

const applySellProceeds = (value: number, feeRate: number, feeFixed: number, slippageBps: number) =>
  value * (1 - feeRate) - feeFixed - value * (slippageBps / 10_000)

const toCny = (value: number, fx: number) => value * fx

const buildDcaSchedule = (params: DcaParams, series: PricePoint[]) => {
  const dates: string[] = []
  let cursor = dayjs(params.startDate)
  const endDate = dayjs(params.endDate)

  while (!cursor.isAfter(endDate, 'day')) {
    const point = findFirstTradingDateOnOrAfter(cursor.format('YYYY-MM-DD'), series)
    if (point && !dayjs(point.date).isAfter(endDate, 'day')) dates.push(point.date)

    switch (params.frequency) {
      case 'daily':
        cursor = cursor.add(1, 'day')
        break
      case 'weekly':
        cursor = cursor.add(1, 'week')
        break
      case 'biweekly':
        cursor = cursor.add(2, 'week')
        break
      case 'monthly':
        cursor = cursor.add(1, 'month')
        break
    }
  }

  return [...new Set(dates)]
}

const validateParams = (params: BacktestParams, series: PricePoint[], fxSeries: FxPoint[], currency: 'USD' | 'CNY') => {
  if (series.length === 0) {
    throw new Error('指数数据为空，无法执行回测')
  }

  if (params.kind === 'dca') {
    if (dayjs(params.startDate).isAfter(dayjs(params.endDate), 'day')) {
      throw new Error('开始日期不能晚于结束日期')
    }
    if (params.amountCny <= 0) {
      throw new Error('每次投入金额必须大于 0')
    }
  } else {
    if (params.initialCashCny < 0) {
      throw new Error('初始资金不能为负数')
    }
    if (params.trades.length === 0) {
      throw new Error('请至少提供一笔交易')
    }
    const dates = new Set(series.map((item) => item.date))
    for (const trade of params.trades) {
      if (!dates.has(trade.date)) {
        throw new Error(`交易日期 ${trade.date} 不在指数交易日历中`)
      }
      if (trade.value <= 0) {
        throw new Error(`交易日期 ${trade.date} 的交易值必须大于 0`)
      }
    }
  }

  if (currency === 'USD' && fxSeries.length === 0) {
    throw new Error('缺少汇率数据，无法执行美元资产回测')
  }
}

const computeDca = (
  params: DcaParams,
  series: PricePoint[],
  fxSeries: FxPoint[],
  currency: 'USD' | 'CNY',
): CurveBuildResult => {
  const schedule = new Set(buildDcaSchedule(params, series))
  let units = 0
  let investedCny = 0
  const cashCny = 0
  const trades: ExecutedTrade[] = []

  const curve = series
    .filter(
      (point) =>
        !dayjs(point.date).isBefore(params.startDate, 'day') &&
        !dayjs(point.date).isAfter(params.endDate, 'day'),
    )
    .map((point) => {
      let dailyFlowCny = 0
      const fx = currency === 'USD' ? alignFxRate(point.date, fxSeries).usdCny : 1

      if (schedule.has(point.date)) {
        const grossCny = params.amountCny
        const netCny = applyBuyCost(grossCny, params.feeRate, params.feeFixed, params.slippageBps)
        const effectiveValue = currency === 'USD' ? netCny / fx : netCny
        const tradeUnits = effectiveValue / point.close
        units += tradeUnits
        investedCny += grossCny
        dailyFlowCny = grossCny
        trades.push({
          date: point.date,
          side: 'buy',
          units: tradeUnits,
          price: point.close,
          fx,
        })
      }

      const holdingsValueCny = toCny(units * point.close, fx)
      return {
        date: point.date,
        investedCny,
        valueCny: holdingsValueCny + cashCny,
        cashCny,
        holdingsValueCny,
        dailyFlowCny,
      }
    })

  return { curve, trades }
}

const computeManual = (
  params: ManualParams,
  series: PricePoint[],
  fxSeries: FxPoint[],
  currency: 'USD' | 'CNY',
): CurveBuildResult => {
  const tradeMap = new Map(params.trades.map((trade) => [trade.date, trade]))
  let units = 0
  let cashCny = params.initialCashCny
  const investedCny = params.initialCashCny
  const trades: ExecutedTrade[] = []

  const curve = series
    .filter(
      (point) =>
        !dayjs(point.date).isBefore(params.trades[0]?.date ?? series[0].date, 'day') &&
        !dayjs(point.date).isAfter(params.trades.at(-1)?.date ?? series.at(-1)?.date, 'day'),
    )
    .map((point, index) => {
      const trade = tradeMap.get(point.date)
      const fx = currency === 'USD' ? alignFxRate(point.date, fxSeries).usdCny : 1
      let dailyFlowCny = index === 0 ? params.initialCashCny : 0

      if (trade) {
        const executionPrice = point.close
        if (trade.side === 'buy') {
          const cashSpend =
            trade.valueMode === 'cash' ? trade.value : trade.value * executionPrice * fx
          const netSpend = applyBuyCost(
            cashSpend,
            trade.feeRate ?? params.feeRate,
            trade.feeFixed ?? params.feeFixed,
            trade.slippageBps ?? params.slippageBps,
          )
          if (cashSpend > cashCny) {
            throw new Error(`交易日 ${trade.date} 买入金额超过当前现金`)
          }
          const tradedUnits = (currency === 'USD' ? netSpend / fx : netSpend) / executionPrice
          units += tradedUnits
          cashCny -= cashSpend
          trades.push({ date: point.date, side: 'buy', units: tradedUnits, price: executionPrice, fx })
        } else {
          const unitsToSell =
            trade.valueMode === 'units' ? trade.value : trade.value / fx / executionPrice
          if (unitsToSell > units) {
            throw new Error('卖出份额超过当前持仓')
          }
          units -= unitsToSell
          const gross = unitsToSell * executionPrice * fx
          const net = applySellProceeds(
            gross,
            trade.feeRate ?? params.feeRate,
            trade.feeFixed ?? params.feeFixed,
            trade.slippageBps ?? params.slippageBps,
          )
          cashCny += net
          dailyFlowCny = -net
          trades.push({ date: point.date, side: 'sell', units: unitsToSell, price: executionPrice, fx })
        }
      }

      const holdingsValueCny = toCny(units * point.close, fx)
      return {
        date: point.date,
        investedCny,
        valueCny: holdingsValueCny + cashCny,
        cashCny,
        holdingsValueCny,
        dailyFlowCny,
      }
    })

  return { curve, trades }
}

const computeBenchmarkCurve = (
  params: BacktestParams,
  curve: CurveBuildPoint[],
  series: PricePoint[],
  fxSeries: FxPoint[],
  currency: 'USD' | 'CNY',
): BenchmarkCurvePoint[] => {
  if (curve.length === 0) return []

  const seriesMap = new Map(series.map((item) => [item.date, item]))
  const firstPoint = curve[0]
  const startSeries = seriesMap.get(firstPoint.date) ?? series[0]
  const fx = currency === 'USD' ? alignFxRate(startSeries.date, fxSeries).usdCny : 1
  const benchmarkCapital =
    params.kind === 'dca'
      ? curve.at(-1)?.investedCny ?? 0
      : (params as ManualParams).initialCashCny
  const benchmarkUnits =
    benchmarkCapital > 0 ? (currency === 'USD' ? benchmarkCapital / fx : benchmarkCapital) / startSeries.close : 0

  let peak = 0
  return curve.map((item) => {
    const pricePoint = seriesMap.get(item.date) ?? startSeries
    const rate = currency === 'USD' ? alignFxRate(item.date, fxSeries).usdCny : 1
    const valueCny = benchmarkUnits * pricePoint.close * rate
    peak = Math.max(peak, valueCny)
    return {
      date: item.date,
      valueCny,
      drawdown: peak === 0 ? 0 : valueCny / peak - 1,
      returnRate: benchmarkCapital === 0 ? 0 : valueCny / benchmarkCapital - 1,
    }
  })
}

const computeRiskMetrics = (curve: BacktestCurvePoint[], yearly: YearlyMetric[]): RiskMetrics => {
  let peak = 0
  let peakDate: string | null = null
  let maxDrawdown = 0
  let maxDrawdownStartDate: string | null = null
  let maxDrawdownEndDate: string | null = null
  let troughPeakValue = 0

  for (const point of curve) {
    if (point.valueCny >= peak) {
      peak = point.valueCny
      peakDate = point.date
    }

    if (point.drawdown < maxDrawdown) {
      maxDrawdown = point.drawdown
      maxDrawdownStartDate = peakDate
      maxDrawdownEndDate = point.date
      troughPeakValue = peak
    }
  }

  const recoveryPoint =
    maxDrawdownEndDate && troughPeakValue > 0
      ? curve.find(
          (point) =>
            dayjs(point.date).isAfter(maxDrawdownEndDate, 'day') && point.valueCny >= troughPeakValue,
        )
      : null

  const dailyReturns = curve
    .map((point, index) => {
      if (index === 0) return null
      const previous = curve[index - 1]
      return previous.valueCny === 0 ? null : point.valueCny / previous.valueCny - 1
    })
    .filter((value): value is number => value != null)
  const averageReturn = dailyReturns.length
    ? dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length
    : null
  const variance =
    averageReturn == null || dailyReturns.length < 2
      ? null
      : dailyReturns.reduce((sum, value) => sum + (value - averageReturn) ** 2, 0) / (dailyReturns.length - 1)
  const volatility = variance == null ? null : Math.sqrt(variance) * Math.sqrt(252)
  const winRateByYear =
    yearly.length === 0 ? null : yearly.filter((item) => item.returnRate > 0).length / yearly.length
  const holdingDays = curve.filter((item) => item.holdingsValueCny > 0).length
  const maxDrawdownRecoveryDays =
    maxDrawdownEndDate && recoveryPoint?.date
      ? dayjs(recoveryPoint.date).diff(dayjs(maxDrawdownEndDate), 'day')
      : null

  return {
    maxDrawdown,
    maxDrawdownStartDate,
    maxDrawdownEndDate,
    maxDrawdownRecoveryDate: recoveryPoint?.date ?? null,
    maxDrawdownRecoveryDays,
    currentDrawdown: curve.at(-1)?.drawdown ?? 0,
    volatility,
    winRateByYear,
    holdingDays,
  }
}

const computeYearlyMetrics = (curve: BacktestCurvePoint[], benchmarkCurve: BenchmarkCurvePoint[]): YearlyMetric[] => {
  const map = new Map<number, { points: BacktestCurvePoint[]; benchmark: BenchmarkCurvePoint[] }>()

  for (const point of curve) {
    const year = dayjs(point.date).year()
    const bucket = map.get(year) ?? { points: [], benchmark: [] }
    bucket.points.push(point)
    map.set(year, bucket)
  }

  for (const point of benchmarkCurve) {
    const year = dayjs(point.date).year()
    const bucket = map.get(year) ?? { points: [], benchmark: [] }
    bucket.benchmark.push(point)
    map.set(year, bucket)
  }

  return [...map.entries()].map(([year, bucket]) => {
    const first = bucket.points[0]
    const last = bucket.points.at(-1) ?? first
    const firstBenchmark = bucket.benchmark[0]
    const lastBenchmark = bucket.benchmark.at(-1) ?? firstBenchmark
    const investedStart = first?.investedCny ?? 0
    const investedEnd = last?.investedCny ?? investedStart
    const investedCny = investedEnd - investedStart
    const baselineValue = first?.valueCny ?? 0
    const benchmarkBaselineValue = firstBenchmark?.valueCny ?? 0
    const strategyReturnRate = baselineValue === 0 ? 0 : (last?.valueCny ?? 0) / baselineValue - 1
    const benchmarkReturnRate =
      benchmarkBaselineValue === 0 ? 0 : (lastBenchmark?.valueCny ?? 0) / benchmarkBaselineValue - 1
    return {
      year,
      investedCny,
      endingValueCny: last?.valueCny ?? 0,
      profitCny: (last?.valueCny ?? 0) - (first?.valueCny ?? 0) - investedCny,
      returnRate: strategyReturnRate,
      benchmarkReturnRate,
      excessReturnRate: strategyReturnRate - benchmarkReturnRate,
      maxDrawdown: Math.min(...bucket.points.map((item) => item.drawdown), 0),
    }
  })
}

export const runBacktestEngine = (
  params: BacktestParams,
  series: PricePoint[],
  fxSeries: FxPoint[],
  currency: 'USD' | 'CNY',
): BacktestResult => {
  validateParams(params, series, fxSeries, currency)
  const { curve: curveBase, trades } =
    params.kind === 'dca'
      ? computeDca(params, series, fxSeries, currency)
      : computeManual(params, series, fxSeries, currency)
  const sortedBase = sortByDate(curveBase)
  const benchmarkBase = computeBenchmarkCurve(params, sortedBase, series, fxSeries, currency)
  const sortedBenchmark = sortByDate(benchmarkBase)
  let peak = 0
  let benchmarkPeak = 0

  const curve: BacktestCurvePoint[] = sortedBase.map((item, index) => {
    const benchmark = sortedBenchmark[index]
    peak = Math.max(peak, item.valueCny)
    benchmarkPeak = Math.max(benchmarkPeak, benchmark?.valueCny ?? 0)
    return {
      date: item.date,
      investedCny: item.investedCny,
      valueCny: item.valueCny,
      benchmarkValueCny: benchmark?.valueCny ?? 0,
      excessValueCny: item.valueCny - (benchmark?.valueCny ?? 0),
      drawdown: peak === 0 ? 0 : item.valueCny / peak - 1,
      benchmarkDrawdown:
        benchmarkPeak === 0 ? 0 : (benchmark?.valueCny ?? 0) / benchmarkPeak - 1,
      cashCny: item.cashCny,
      holdingsValueCny: item.holdingsValueCny,
      positionRatio: item.valueCny === 0 ? 0 : item.holdingsValueCny / item.valueCny,
      dailyFlowCny: item.dailyFlowCny,
    }
  })

  const totalInvestedCny = curve.at(-1)?.investedCny ?? 0
  const endingValueCny = curve.at(-1)?.valueCny ?? 0
  const benchmarkEndingValueCny = curve.at(-1)?.benchmarkValueCny ?? 0
  const totalProfitCny = endingValueCny - totalInvestedCny
  const totalReturnRate = totalInvestedCny === 0 ? 0 : endingValueCny / totalInvestedCny - 1
  const benchmarkTotalReturnRate =
    totalInvestedCny === 0 ? 0 : benchmarkEndingValueCny / totalInvestedCny - 1
  const firstDate = dayjs(curve[0]?.date)
  const lastDate = dayjs(curve.at(-1)?.date)
  const years = Math.max(lastDate.diff(firstDate, 'day') / 365, 0)
  const annualizedReturn =
    totalInvestedCny > 0 && years > 0 ? (endingValueCny / totalInvestedCny) ** (1 / years) - 1 : null
  const benchmarkAnnualizedReturn =
    totalInvestedCny > 0 && years > 0
      ? (benchmarkEndingValueCny / totalInvestedCny) ** (1 / years) - 1
      : null
  const excessReturnRate = totalReturnRate - benchmarkTotalReturnRate
  const yearly = computeYearlyMetrics(curve, sortedBenchmark)
  const riskMetrics = computeRiskMetrics(curve, yearly)
  const cashflows =
    params.kind === 'dca'
      ? trades.map((trade) => ({ date: trade.date, amount: -((params as DcaParams).amountCny ?? 0) }))
      : [
          {
            date: curve[0]?.date ?? new Date().toISOString().slice(0, 10),
            amount: -(params as ManualParams).initialCashCny,
          },
        ]

  if (curve.length > 0) {
    cashflows.push({
      date: curve.at(-1)!.date,
      amount: endingValueCny,
    })
  }

  const benchmarkCurve: BenchmarkCurvePoint[] = curve.map((item, index) => ({
    date: item.date,
    valueCny: item.benchmarkValueCny,
    drawdown: sortedBenchmark[index]?.drawdown ?? 0,
    returnRate: totalInvestedCny === 0 ? 0 : item.benchmarkValueCny / totalInvestedCny - 1,
  }))

  const excessReturnCurve: ExcessReturnPoint[] = curve.map((item) => ({
    date: item.date,
    excessValueCny: item.excessValueCny,
    excessReturnRate: totalInvestedCny === 0 ? 0 : item.excessValueCny / totalInvestedCny,
  }))

  const holdingMetrics: HoldingMetricPoint[] = curve.map((item) => ({
    date: item.date,
    holdingsValueCny: item.holdingsValueCny,
    cashCny: item.cashCny,
    positionRatio: item.positionRatio,
  }))

  return {
    summary: {
      totalInvestedCny,
      endingValueCny,
      benchmarkEndingValueCny,
      totalProfitCny,
      totalReturnRate,
      annualizedReturn,
      benchmarkTotalReturnRate,
      benchmarkAnnualizedReturn,
      excessReturnRate,
      xirr: calculateXirr(cashflows),
      maxDrawdown: riskMetrics.maxDrawdown,
      maxDrawdownStartDate: riskMetrics.maxDrawdownStartDate,
      maxDrawdownEndDate: riskMetrics.maxDrawdownEndDate,
      maxDrawdownRecoveryDate: riskMetrics.maxDrawdownRecoveryDate,
      maxDrawdownRecoveryDays: riskMetrics.maxDrawdownRecoveryDays,
      currentDrawdown: riskMetrics.currentDrawdown,
      volatility: riskMetrics.volatility,
      winRateByYear: riskMetrics.winRateByYear,
      holdingDays: riskMetrics.holdingDays,
      tradeCount: trades.length,
    },
    curve,
    benchmarkCurve,
    excessReturnCurve,
    yearly,
    holdingMetrics,
    riskMetrics,
    executedTrades: trades,
  }
}
