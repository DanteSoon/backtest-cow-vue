export type IndexCode =
  | 'SPX'
  | 'NDX'
  | 'DJI'
  | 'RUT'
  | 'CSI300'
  | 'CSI500'
  | 'SHCOMP'
  | 'SZCOMP'
  | 'CHINEXT'
  | 'STAR50'
  | 'GOLD_ETF'
export type StrategyKind = 'dca' | 'manual'
export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly'
export type AssetCurrency = 'USD' | 'CNY'
export type DataSource = 'yahoo' | 'eastmoney' | 'sina'
export type TradingCalendar = 'US' | 'CN'
export type ValidationStatus = 'ok' | 'warning' | 'error'
export type DcaAllocationMode = 'ratio' | 'amount'
export type DcaDateMode = 'start-duration' | 'end-recent'

export interface PricePoint {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export interface FxPoint {
  date: string
  usdCny: number
}

export interface FieldCoverage {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MissingDateRange {
  startDate: string
  endDate: string
  missingDays: number
}

export interface ConfirmedClosure {
  startDate: string
  endDate: string
  missingDays: number
  reason: string
}

export interface DataQualitySummary {
  validationStatus: ValidationStatus
  staleDays: number
  pointCount: number
  missingRangeCount: number
  missingDateRanges: MissingDateRange[]
  confirmedClosures: ConfirmedClosure[]
  fieldCoverage: FieldCoverage
  issueCount: number
  hasSuspiciousGaps: boolean
  message: string
}

export interface IndexMeta {
  code: IndexCode
  name: string
  shortName: string
  market: 'US' | 'CN'
  currency: AssetCurrency
  source: DataSource
  sourceSymbol: string
  tradingCalendar: TradingCalendar
  startDate: string
  endDate: string
  pointCount: number
  latestClose: number
  latestDate: string
  description: string
  dataQuality: DataQualitySummary
}

export interface DataManifest {
  updatedAt: string
  generatedAt: string
  indices: IndexMeta[]
}

export interface DcaPortfolioLeg {
  indexCode: IndexCode
  ratio: number
  amountCny: number
}

export interface DcaParams {
  kind: 'dca'
  portfolio: DcaPortfolioLeg[]
  allocationMode: DcaAllocationMode
  dateMode: DcaDateMode
  startDate: string
  endDate: string
  durationYears: number
  recentYears: number
  periodicTotalAmountCny: number
  frequency: Frequency
  feeRate: number
  feeFixed: number
  slippageBps: number
}

export interface CostParams {
  feeRate: number
  feeFixed: number
  slippageBps: number
}

export interface ManualTrade {
  date: string
  side: 'buy' | 'sell'
  valueMode: 'cash' | 'units'
  value: number
  feeRate: number
  feeFixed: number
  slippageBps: number
}

export interface ManualParams {
  kind: 'manual'
  indexCode: IndexCode
  initialCashCny: number
  feeRate: number
  feeFixed: number
  slippageBps: number
  trades: ManualTrade[]
}

export type BacktestParams = DcaParams | ManualParams

export interface BacktestSummary {
  totalInvestedCny: number
  endingValueCny: number
  benchmarkEndingValueCny: number
  totalProfitCny: number
  totalReturnRate: number
  annualizedReturn: number | null
  benchmarkTotalReturnRate: number
  benchmarkAnnualizedReturn: number | null
  excessReturnRate: number
  xirr: number | null
  maxDrawdown: number
  maxDrawdownStartDate: string | null
  maxDrawdownEndDate: string | null
  maxDrawdownRecoveryDate: string | null
  maxDrawdownRecoveryDays: number | null
  currentDrawdown: number
  volatility: number | null
  winRateByYear: number | null
  holdingDays: number
  tradeCount: number
}

export interface BacktestCurvePoint {
  date: string
  investedCny: number
  valueCny: number
  benchmarkValueCny: number
  excessValueCny: number
  drawdown: number
  benchmarkDrawdown: number
  cashCny: number
  holdingsValueCny: number
  positionRatio: number
  dailyFlowCny: number
}

export interface YearlyMetric {
  year: number
  investedCny: number
  profitCny: number
  endingValueCny: number
  returnRate: number
  benchmarkReturnRate: number
  excessReturnRate: number
  maxDrawdown: number
}

export interface ExecutedTrade {
  date: string
  indexCode: IndexCode
  side: 'buy' | 'sell'
  units: number
  price: number
  fx?: number
  grossAmountCny: number
  netAmountCny: number
}

export interface BenchmarkCurvePoint {
  date: string
  valueCny: number
  drawdown: number
  returnRate: number
}

export interface ExcessReturnPoint {
  date: string
  excessValueCny: number
  excessReturnRate: number
}

export interface HoldingMetricPoint {
  date: string
  holdingsValueCny: number
  cashCny: number
  positionRatio: number
}

export interface RiskMetrics {
  maxDrawdown: number
  maxDrawdownStartDate: string | null
  maxDrawdownEndDate: string | null
  maxDrawdownRecoveryDate: string | null
  maxDrawdownRecoveryDays: number | null
  currentDrawdown: number
  volatility: number | null
  winRateByYear: number | null
  holdingDays: number
}

export interface AssetCurvePoint {
  date: string
  indexCode: IndexCode
  investedCny: number
  valueCny: number
  units: number
}

export interface AssetSummary {
  indexCode: IndexCode
  investedCny: number
  endingValueCny: number
  returnRate: number
  tradeCount: number
}

export interface ResolvedDateRange {
  startDate: string
  endDate: string
  label: string
}

export interface BacktestDataset {
  seriesByCode: Partial<Record<IndexCode, PricePoint[]>>
  currencyByCode: Partial<Record<IndexCode, AssetCurrency>>
}

export interface BacktestResult {
  summary: BacktestSummary
  curve: BacktestCurvePoint[]
  benchmarkCurve: BenchmarkCurvePoint[]
  excessReturnCurve: ExcessReturnPoint[]
  yearly: YearlyMetric[]
  holdingMetrics: HoldingMetricPoint[]
  riskMetrics: RiskMetrics
  executedTrades: ExecutedTrade[]
  assetCurves: AssetCurvePoint[]
  assetSummaries: AssetSummary[]
  resolvedRange: ResolvedDateRange
}

export interface SeriesBundle {
  meta: IndexMeta
  series: PricePoint[]
}

export interface OverviewMetric {
  code: IndexCode
  latestClose: number
  latestDate: string
  oneYearReturn: number | null
  pointCount: number
  dataQuality: DataQualitySummary
}
