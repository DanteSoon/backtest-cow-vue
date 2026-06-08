import dayjs from 'dayjs'
import type {
  AssetCurrency,
  AssetCurvePoint,
  AssetSummary,
  BacktestCurvePoint,
  BacktestDataset,
  BacktestParams,
  BacktestResult,
  BenchmarkCurvePoint,
  DcaParams,
  DcaPortfolioLeg,
  ExecutedTrade,
  ExcessReturnPoint,
  FxPoint,
  HoldingMetricPoint,
  IndexCode,
  ManualParams,
  PricePoint,
  ResolvedDateRange,
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

interface AssetState {
  indexCode: IndexCode
  units: number
  investedCny: number
}

interface PreparedSeries {
  indexCode: IndexCode
  currency: AssetCurrency
  series: PricePoint[]
  seriesMap: Map<string, PricePoint>
}

interface CurveBuildResult {
  curve: CurveBuildPoint[]
  trades: ExecutedTrade[]
  assetCurves: AssetCurvePoint[]
  assetSummaries: AssetSummary[]
  resolvedRange: ResolvedDateRange
}

interface PlannedTrade {
  indexCode: IndexCode
  grossAmountCny: number
}

const applyBuyCost = (value: number, feeRate: number, feeFixed: number, slippageBps: number) =>
  value * (1 - feeRate) - feeFixed - value * (slippageBps / 10_000)

const applySellProceeds = (value: number, feeRate: number, feeFixed: number, slippageBps: number) =>
  value * (1 - feeRate) - feeFixed - value * (slippageBps / 10_000)

const toCny = (value: number, fx: number) => value * fx

const getSeriesOrThrow = (dataset: BacktestDataset, code: IndexCode) => {
  const series = dataset.seriesByCode[code]
  if (!series || series.length === 0) {
    throw new Error(`${code} 指数数据为空，无法执行回测`)
  }
  return sortByDate(series)
}

const getCurrencyOrThrow = (dataset: BacktestDataset, code: IndexCode): AssetCurrency => {
  const currency = dataset.currencyByCode[code]
  if (!currency) {
    throw new Error(`${code} 缺少币种信息`)
  }
  return currency
}

const prepareSeries = (dataset: BacktestDataset, codes: IndexCode[]): PreparedSeries[] =>
  [...new Set(codes)].map((indexCode) => {
    const series = getSeriesOrThrow(dataset, indexCode)
    return {
      indexCode,
      currency: getCurrencyOrThrow(dataset, indexCode),
      series,
      seriesMap: new Map(series.map((point) => [point.date, point])),
    }
  })

const getRequestedEndDate = (params: DcaParams) =>
  params.dateMode === 'start-duration'
    ? dayjs(params.startDate).add(params.durationYears, 'year').format('YYYY-MM-DD')
    : params.endDate

const getRequestedStartDate = (params: DcaParams) =>
  params.dateMode === 'end-recent'
    ? dayjs(params.endDate).subtract(params.recentYears, 'year').add(1, 'day').format('YYYY-MM-DD')
    : params.startDate

const resolveDcaRange = (params: DcaParams, prepared: PreparedSeries[]): ResolvedDateRange => {
  const commonStartDate = prepared
    .map((item) => item.series[0]?.date)
    .filter(Boolean)
    .sort()
    .at(-1)
  const commonEndDate = prepared
    .map((item) => item.series.at(-1)?.date)
    .filter(Boolean)
    .sort()[0]

  if (!commonStartDate || !commonEndDate) {
    throw new Error('组合中存在缺失数据的指数，无法解析回测区间')
  }

  const requestedStartDate = getRequestedStartDate(params)
  const requestedEndDate = getRequestedEndDate(params)
  const startDate = requestedStartDate > commonStartDate ? requestedStartDate : commonStartDate
  const endDate = requestedEndDate < commonEndDate ? requestedEndDate : commonEndDate

  if (dayjs(startDate).isAfter(dayjs(endDate), 'day')) {
    throw new Error('可回测区间为空，请调整日期模式或指数范围')
  }

  return {
    startDate,
    endDate,
    label:
      params.dateMode === 'start-duration'
        ? `从 ${startDate} 开始，持续 ${params.durationYears} 年`
        : `截止 ${endDate}，回看近 ${params.recentYears} 年`,
  }
}

const buildDcaTargets = (params: DcaParams, range: ResolvedDateRange) => {
  const dates: string[] = []
  let cursor = dayjs(range.startDate)
  const endDate = dayjs(range.endDate)

  while (!cursor.isAfter(endDate, 'day')) {
    dates.push(cursor.format('YYYY-MM-DD'))

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

  return dates
}

const normalizePortfolio = (params: DcaParams): DcaPortfolioLeg[] => {
  const normalized = params.portfolio
    .filter((item) => item.indexCode)
    .map((item) => ({
      indexCode: item.indexCode,
      ratio: Number(item.ratio ?? 0),
      amountCny: Number(item.amountCny ?? 0),
    }))

  if (normalized.length === 0) {
    throw new Error('请至少选择一个定投标的')
  }

  return normalized
}

const getLegAmount = (params: DcaParams, leg: DcaPortfolioLeg, ratioBase: number) => {
  if (params.allocationMode === 'amount') return leg.amountCny
  return ratioBase === 0 ? 0 : params.periodicTotalAmountCny * (leg.ratio / ratioBase)
}

const buildTradePlan = (params: DcaParams, prepared: PreparedSeries[], range: ResolvedDateRange) => {
  const targets = buildDcaTargets(params, range)
  const ratioBase = params.portfolio.reduce((sum, item) => sum + Math.max(item.ratio, 0), 0)
  const tradePlan = new Map<string, PlannedTrade[]>()

  for (const leg of params.portfolio) {
    const preparedSeries = prepared.find((item) => item.indexCode === leg.indexCode)
    if (!preparedSeries) continue
    const filteredSeries = preparedSeries.series.filter(
      (point) => point.date >= range.startDate && point.date <= range.endDate,
    )

    for (const targetDate of targets) {
      const amount = getLegAmount(params, leg, ratioBase)
      if (amount <= 0) continue
      const point = findFirstTradingDateOnOrAfter(targetDate, filteredSeries)
      if (!point || point.date > range.endDate) continue
      const existing = tradePlan.get(point.date) ?? []
      existing.push({
        indexCode: leg.indexCode,
        grossAmountCny: amount,
      })
      tradePlan.set(point.date, existing)
    }
  }

  return tradePlan
}

const getUnionDates = (prepared: PreparedSeries[], startDate: string, endDate: string) =>
  [...new Set(
    prepared.flatMap((item) =>
      item.series
        .filter((point) => point.date >= startDate && point.date <= endDate)
        .map((point) => point.date),
    ),
  )].sort()

const getLatestPointOnOrBefore = (series: PricePoint[], date: string) => {
  let matched: PricePoint | null = null
  for (const point of series) {
    if (point.date > date) break
    matched = point
  }
  return matched
}

const validateParams = (params: BacktestParams, dataset: BacktestDataset, fxSeries: FxPoint[]) => {
  if (params.kind === 'dca') {
    const portfolio = normalizePortfolio(params)
    const prepared = prepareSeries(dataset, portfolio.map((item) => item.indexCode))
    const range = resolveDcaRange(params, prepared)

    if (params.allocationMode === 'ratio') {
      if (params.periodicTotalAmountCny <= 0) {
        throw new Error('每期定投总金额必须大于 0')
      }
      if (portfolio.reduce((sum, item) => sum + Math.max(item.ratio, 0), 0) <= 0) {
        throw new Error('组合占比之和必须大于 0')
      }
    } else if (portfolio.every((item) => item.amountCny <= 0)) {
      throw new Error('按金额模式下至少需要一个标的金额大于 0')
    }

    if (params.dateMode === 'start-duration' && params.durationYears <= 0) {
      throw new Error('投资时长必须大于 0')
    }
    if (params.dateMode === 'end-recent' && params.recentYears <= 0) {
      throw new Error('近 X 年必须大于 0')
    }

    const hasUsdAsset = prepared.some((item) => item.currency === 'USD')
    if (hasUsdAsset && fxSeries.length === 0) {
      throw new Error('缺少汇率数据，无法执行美元资产回测')
    }
    if (hasUsdAsset && fxSeries[0] && range.startDate < fxSeries[0].date) {
      throw new Error(`当前 USD/CNY 历史汇率从 ${fxSeries[0].date} 开始，美股人民币折算回测请晚于该日期`)
    }

    return
  }

  const series = getSeriesOrThrow(dataset, params.indexCode)
  const currency = getCurrencyOrThrow(dataset, params.indexCode)
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

  if (currency === 'USD' && fxSeries.length === 0) {
    throw new Error('缺少汇率数据，无法执行美元资产回测')
  }
}

const computeDca = (params: DcaParams, dataset: BacktestDataset, fxSeries: FxPoint[]): CurveBuildResult => {
  const portfolio = normalizePortfolio(params)
  const prepared = prepareSeries(dataset, portfolio.map((item) => item.indexCode))
  const range = resolveDcaRange(params, prepared)
  const tradePlan = buildTradePlan(
    {
      ...params,
      portfolio,
    },
    prepared,
    range,
  )
  const unionDates = getUnionDates(prepared, range.startDate, range.endDate)
  const assetStateMap = new Map<IndexCode, AssetState>(
    portfolio.map((item) => [
      item.indexCode,
      {
        indexCode: item.indexCode,
        units: 0,
        investedCny: 0,
      },
    ]),
  )
  const trades: ExecutedTrade[] = []
  const assetCurves: AssetCurvePoint[] = []
  let totalInvestedCny = 0

  const curve = unionDates.map((date) => {
    let dailyFlowCny = 0
    const dayTrades = tradePlan.get(date) ?? []

    for (const trade of dayTrades) {
      const state = assetStateMap.get(trade.indexCode)
      const preparedSeries = prepared.find((item) => item.indexCode === trade.indexCode)
      const point = preparedSeries?.seriesMap.get(date)
      if (!state || !preparedSeries || !point) continue

      const fx = preparedSeries.currency === 'USD' ? alignFxRate(date, fxSeries).usdCny : 1
      const netAmountCny = applyBuyCost(
        trade.grossAmountCny,
        params.feeRate,
        params.feeFixed,
        params.slippageBps,
      )
      const assetAmount = preparedSeries.currency === 'USD' ? netAmountCny / fx : netAmountCny
      const units = assetAmount / point.close
      state.units += units
      state.investedCny += trade.grossAmountCny
      totalInvestedCny += trade.grossAmountCny
      dailyFlowCny += trade.grossAmountCny

      trades.push({
        date,
        indexCode: trade.indexCode,
        side: 'buy',
        units,
        price: point.close,
        fx,
        grossAmountCny: trade.grossAmountCny,
        netAmountCny,
      })
    }

    let holdingsValueCny = 0
    for (const item of prepared) {
      const state = assetStateMap.get(item.indexCode)
      const latestPoint = getLatestPointOnOrBefore(item.series, date)
      if (!state || !latestPoint) continue
      const fx = item.currency === 'USD' ? alignFxRate(date, fxSeries).usdCny : 1
      const valueCny = toCny(state.units * latestPoint.close, fx)
      holdingsValueCny += valueCny
      assetCurves.push({
        date,
        indexCode: item.indexCode,
        investedCny: state.investedCny,
        valueCny,
        units: state.units,
      })
    }

    return {
      date,
      investedCny: totalInvestedCny,
      valueCny: holdingsValueCny,
      cashCny: 0,
      holdingsValueCny,
      dailyFlowCny,
    }
  })

  const assetSummaries = portfolio.map((leg) => {
    const state = assetStateMap.get(leg.indexCode)
    const lastCurve = [...assetCurves].reverse().find((item) => item.indexCode === leg.indexCode)
    const investedCny = state?.investedCny ?? 0
    const endingValueCny = lastCurve?.valueCny ?? 0
    return {
      indexCode: leg.indexCode,
      investedCny,
      endingValueCny,
      returnRate: investedCny === 0 ? 0 : endingValueCny / investedCny - 1,
      tradeCount: trades.filter((trade) => trade.indexCode === leg.indexCode).length,
    }
  })

  return {
    curve,
    trades,
    assetCurves,
    assetSummaries,
    resolvedRange: range,
  }
}

const computeManual = (params: ManualParams, dataset: BacktestDataset, fxSeries: FxPoint[]): CurveBuildResult => {
  const series = getSeriesOrThrow(dataset, params.indexCode)
  const currency = getCurrencyOrThrow(dataset, params.indexCode)
  const tradeMap = new Map(params.trades.map((trade) => [trade.date, trade]))
  let units = 0
  let cashCny = params.initialCashCny
  const investedCny = params.initialCashCny
  const trades: ExecutedTrade[] = []
  const assetCurves: AssetCurvePoint[] = []
  const startDate = params.trades[0]?.date ?? series[0].date
  const endDate = params.trades.at(-1)?.date ?? series.at(-1)?.date ?? startDate

  const curve = series
    .filter((point) => !dayjs(point.date).isBefore(startDate, 'day') && !dayjs(point.date).isAfter(endDate, 'day'))
    .map((point, index) => {
      const trade = tradeMap.get(point.date)
      const fx = currency === 'USD' ? alignFxRate(point.date, fxSeries).usdCny : 1
      let dailyFlowCny = index === 0 ? params.initialCashCny : 0

      if (trade) {
        const executionPrice = point.close
        if (trade.side === 'buy') {
          const grossAmountCny =
            trade.valueMode === 'cash' ? trade.value : trade.value * executionPrice * fx
          const netAmountCny = applyBuyCost(
            grossAmountCny,
            trade.feeRate ?? params.feeRate,
            trade.feeFixed ?? params.feeFixed,
            trade.slippageBps ?? params.slippageBps,
          )
          if (grossAmountCny > cashCny) {
            throw new Error(`交易日 ${trade.date} 买入金额超过当前现金`)
          }
          const tradedUnits = (currency === 'USD' ? netAmountCny / fx : netAmountCny) / executionPrice
          units += tradedUnits
          cashCny -= grossAmountCny
          trades.push({
            date: point.date,
            indexCode: params.indexCode,
            side: 'buy',
            units: tradedUnits,
            price: executionPrice,
            fx,
            grossAmountCny,
            netAmountCny,
          })
        } else {
          const unitsToSell =
            trade.valueMode === 'units' ? trade.value : trade.value / fx / executionPrice
          if (unitsToSell > units) {
            throw new Error('卖出份额超过当前持仓')
          }
          units -= unitsToSell
          const grossAmountCny = unitsToSell * executionPrice * fx
          const netAmountCny = applySellProceeds(
            grossAmountCny,
            trade.feeRate ?? params.feeRate,
            trade.feeFixed ?? params.feeFixed,
            trade.slippageBps ?? params.slippageBps,
          )
          cashCny += netAmountCny
          dailyFlowCny = -netAmountCny
          trades.push({
            date: point.date,
            indexCode: params.indexCode,
            side: 'sell',
            units: unitsToSell,
            price: executionPrice,
            fx,
            grossAmountCny,
            netAmountCny,
          })
        }
      }

      const holdingsValueCny = toCny(units * point.close, fx)
      assetCurves.push({
        date: point.date,
        indexCode: params.indexCode,
        investedCny,
        valueCny: holdingsValueCny,
        units,
      })
      return {
        date: point.date,
        investedCny,
        valueCny: holdingsValueCny + cashCny,
        cashCny,
        holdingsValueCny,
        dailyFlowCny,
      }
    })

  return {
    curve,
    trades,
    assetCurves,
    assetSummaries: [
      {
        indexCode: params.indexCode,
        investedCny,
        endingValueCny: curve.at(-1)?.valueCny ?? 0,
        returnRate: investedCny === 0 ? 0 : (curve.at(-1)?.valueCny ?? 0) / investedCny - 1,
        tradeCount: trades.length,
      },
    ],
    resolvedRange: {
      startDate,
      endDate,
      label: `${startDate} 至 ${endDate}`,
    },
  }
}

const computeBenchmarkCurve = (
  params: BacktestParams,
  curve: CurveBuildPoint[],
  assetSummaries: AssetSummary[],
  assetCurves: AssetCurvePoint[],
  dataset: BacktestDataset,
  fxSeries: FxPoint[],
): BenchmarkCurvePoint[] => {
  if (curve.length === 0) return []

  const benchmarkUnits = new Map<IndexCode, number>()

  if (params.kind === 'dca') {
    for (const item of assetSummaries) {
      const series = getSeriesOrThrow(dataset, item.indexCode)
      const currency = getCurrencyOrThrow(dataset, item.indexCode)
      const startPoint = findFirstTradingDateOnOrAfter(curve[0].date, series) ?? series[0]
      const fx = currency === 'USD' ? alignFxRate(startPoint.date, fxSeries).usdCny : 1
      benchmarkUnits.set(
        item.indexCode,
        item.investedCny > 0 ? (currency === 'USD' ? item.investedCny / fx : item.investedCny) / startPoint.close : 0,
      )
    }
  } else {
    const indexCode = (params as ManualParams).indexCode
    const series = getSeriesOrThrow(dataset, indexCode)
    const currency = getCurrencyOrThrow(dataset, indexCode)
    const startPoint = findFirstTradingDateOnOrAfter(curve[0].date, series) ?? series[0]
    const fx = currency === 'USD' ? alignFxRate(startPoint.date, fxSeries).usdCny : 1
    benchmarkUnits.set(
      indexCode,
      (params as ManualParams).initialCashCny > 0
        ? (currency === 'USD'
            ? (params as ManualParams).initialCashCny / fx
            : (params as ManualParams).initialCashCny) / startPoint.close
        : 0,
    )
  }

  const groupedCurves = new Map<IndexCode, AssetCurvePoint[]>()
  for (const point of assetCurves) {
    const bucket = groupedCurves.get(point.indexCode) ?? []
    bucket.push(point)
    groupedCurves.set(point.indexCode, bucket)
  }

  let peak = 0
  const benchmarkCapital =
    params.kind === 'dca'
      ? assetSummaries.reduce((sum, item) => sum + item.investedCny, 0)
      : (params as ManualParams).initialCashCny

  return curve.map((item) => {
    let valueCny = 0

    for (const [indexCode, units] of benchmarkUnits.entries()) {
      const series = getSeriesOrThrow(dataset, indexCode)
      const currency = getCurrencyOrThrow(dataset, indexCode)
      const latestPoint = getLatestPointOnOrBefore(series, item.date)
      if (!latestPoint) continue
      const fx = currency === 'USD' ? alignFxRate(item.date, fxSeries).usdCny : 1
      valueCny += units * latestPoint.close * fx
    }

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

  return [...map.entries()]
    .sort(([left], [right]) => left - right)
    .map(([year, bucket]) => {
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
  dataset: BacktestDataset,
  fxSeries: FxPoint[],
): BacktestResult => {
  validateParams(params, dataset, fxSeries)

  const { curve: curveBase, trades, assetCurves, assetSummaries, resolvedRange } =
    params.kind === 'dca' ? computeDca(params, dataset, fxSeries) : computeManual(params, dataset, fxSeries)
  const sortedBase = sortByDate(curveBase)
  const benchmarkBase = computeBenchmarkCurve(params, sortedBase, assetSummaries, assetCurves, dataset, fxSeries)
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
      benchmarkDrawdown: benchmarkPeak === 0 ? 0 : (benchmark?.valueCny ?? 0) / benchmarkPeak - 1,
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
      ? trades.map((trade) => ({ date: trade.date, amount: -trade.grossAmountCny }))
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
    assetCurves,
    assetSummaries,
    resolvedRange,
  }
}
