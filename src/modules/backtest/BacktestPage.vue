<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import { ElMessage } from 'element-plus'
import AppShell from '@/shared/components/AppShell.vue'
import InfoTip from '@/shared/components/InfoTip.vue'
import { useBacktestWorker } from '@/shared/composables/use-backtest-worker'
import {
  createDefaultDcaParams,
  createDefaultManualParams,
  useBacktestStore,
} from '@/shared/stores/backtest'
import { useDataStore } from '@/shared/stores/data'
import type {
  BacktestDataset,
  BacktestParams,
  DcaPortfolioLeg,
  IndexCode,
} from '@/shared/types/domain'
import { createChartOptions, createDualAxisChartOptions } from '@/shared/utils/chart'
import {
  formatCompactNumber,
  formatDate,
  formatDateTime,
  formatDays,
  formatNullableNumber,
  formatNumber,
  formatPercent,
  formatStrategyKind,
  formatTradeSide,
  formatValidationStatus,
} from '@/shared/utils/formatters'

const backtestStore = useBacktestStore()
const dataStore = useDataStore()
const worker = useBacktestWorker()

const safeCloneParams = (params: BacktestParams): BacktestParams => JSON.parse(JSON.stringify(params))

const formState = ref<BacktestParams>(safeCloneParams(backtestStore.params))
const pageLoading = ref(true)
const pageError = ref<string | null>(null)
const activeView = ref<'strategy' | 'benchmark' | 'risk' | 'yearly'>('strategy')
const isBacktestBusy = computed(() => backtestStore.running || worker.loading.value)

const dcaInfo = {
  totalInvested: '累计投入指回测期间实际投入到组合中的人民币总额，不含资产浮盈浮亏。',
  endingValue: '期末资产指回测结束日组合持仓与现金按人民币折算后的总价值。',
  investedAmount: '累计投入表示该维度下实际投入的本金总额，不包含因市场上涨带来的浮盈。',
  totalReturn: '总收益率 = 期末资产 / 累计投入 - 1，用来衡量整个回测期间的总体盈亏水平。',
  annualizedReturn: '年化收益把整个区间的结果换算为平均每年的复合增长率，便于和其他策略横向比较。',
  xirr: 'XIRR 是考虑每次现金流时点后的内部收益率，适合定投和不规则资金进出场景。',
  maxDrawdown: '最大回撤是历史最高净值到后续最低点的最大跌幅，用来衡量最痛的亏损阶段。',
  drawdownWindow: '最大回撤区间指从前一个净值高点开始，到本轮跌到最低点结束的那段时间。',
  recoveryDays: '最大回撤修复时间是从最大回撤谷底重新回到前高所花费的时间。',
  recoveryDate: '修复日期指组合净值重新回到最大回撤前高点的那一天；若截至回测结束仍未修复，则为空。',
  currentDrawdown: '当前回撤表示截至最后一个交易日，组合距离历史最高点还有多远。',
  excessReturn: '相对基准超额收益 = 策略收益率 - 基准收益率，这里基准为同组合在起始日一次性买入并持有。',
  benchmarkReturn: '基准收益率表示同一组合在起始日一次性买入并持有到年末或区间末的收益水平。',
  yearlyReturn: '年度收益率表示该自然年内组合净值相对年初净值的变化幅度。',
  yearlyDrawdown: '年度最大回撤表示该自然年内从阶段高点到阶段低点的最大跌幅。',
  assetReturn: '组合分项收益率表示单个标的期末资产相对该标的累计投入的涨跌幅。',
  tradeCount: '成交次数表示该标的或策略在回测期间实际发生的买入和卖出笔数。',
  annualVolatility: '年化波动率把日度收益波动折算成年化水平，数值越高通常表示净值波动越大。',
  winRateByYear: '年度胜率表示有正收益的年份数量占全部回测年份的比例。',
  holdingDays: '持仓天数表示组合中至少有一个标的持仓市值大于 0 的交易日数量。',
  positionRatio: '仓位比例 = 持仓市值 / 总资产，用于观察组合在不同时间点的资金暴露程度。',
  holdingsValue: '持仓市值是当前所有持仓按最新价格折算后的总价值，不含现金。',
  cash: '现金表示尚未投入或交易后剩余的可用资金。',
  indexPrice: '指数价格图展示主标的价格走势，并叠加买卖点，便于对照具体交易发生的位置。',
  executedAmount: '投入金额表示该笔交易实际投入的人民币本金，未扣除手续费前记为总投入金额。',
  fxRate: '汇率用于把美元资产折算成人民币；A 股和人民币计价资产通常显示为 1 或空值。',
  frequency: '频率决定定投计划多久触发一次；实际成交会顺延到对应频率之后的首个可交易日。',
  startDate: '开始日期是定投计划希望启动的日期；若当天不是交易日，会自动顺延到后续首个交易日。',
  endDate: '结束日期是回看模式下的区间终点；若晚于可用数据末日，会自动截断到真实数据末日。',
  durationYears: '投资时长决定从开始日期向后延伸多少年作为回测窗口。',
  recentYears: '近 X 年会从结束日期向前回看对应年数，用于快速评估最近一段历史表现。',
  periodicTotalAmount: '每期定投总额表示每次触发定投时要投入的总人民币金额，再按分配模式拆给各标的。',
  indexSelection: '指数决定本期回测包含哪些资产；组合定投支持选择多个标的共同参与。',
  ratio: '占比用于定义每个标的分到总定投金额的比例，系统会按所有标的占比归一后分配资金。',
  amount: '每期金额表示该标的每次定投单独投入多少人民币，适用于固定金额配置。',
  initialCash: '初始资金是普通买卖模式下账户开局持有的人民币现金，用于承接后续买卖交易。',
  feeRate: '费率按成交金额比例扣除，用于模拟佣金、申购费等按比例收取的成本。',
  feeFixed: '固定费用指每笔交易额外扣除的固定成本，用于模拟最低佣金或固定手续费。',
  slippage: '滑点用于模拟成交价偏离理想价格的影响，单位 bps 表示万分之一。',
  allocationMode: '占比模式按总定投金额乘以各标的权重分配；金额模式则为每个标的单独指定每期投入金额。',
  dateMode: '开始日期 + 投资时长适合做固定投资计划；结束日期 + 近 X 年适合回看最近一段历史表现。',
  benchmark: '基准采用同一组标的在回测起始日按对应资金一次性买入并持有，便于比较定投与一次性建仓差异。',
  drawdown: '回撤曲线展示组合从历史峰值回落的百分比，数值越低说明阶段性亏损越深。',
}

const kpiDefinitions = [
  { label: '累计投入', key: 'totalInvestedCny', tip: dcaInfo.totalInvested },
  { label: '期末资产', key: 'endingValueCny', tip: dcaInfo.endingValue },
  { label: '总收益率', key: 'totalReturnRate', tip: dcaInfo.totalReturn },
  { label: '年化收益', key: 'annualizedReturn', tip: dcaInfo.annualizedReturn },
  { label: 'XIRR', key: 'xirr', tip: dcaInfo.xirr },
  { label: '最大回撤', key: 'maxDrawdown', tip: dcaInfo.maxDrawdown },
  { label: '回撤修复时间', key: 'maxDrawdownRecoveryDays', tip: dcaInfo.recoveryDays },
  { label: '当前回撤', key: 'currentDrawdown', tip: dcaInfo.currentDrawdown },
  { label: '相对基准超额', key: 'excessReturnRate', tip: dcaInfo.excessReturn },
] as const

const primaryIndexCode = computed<IndexCode>(() => {
  if (formState.value.kind === 'dca') {
    return formState.value.portfolio[0]?.indexCode ?? 'NDX'
  }
  return formState.value.indexCode
})
const portfolioCodes = computed<IndexCode[]>(() =>
  formState.value.kind === 'dca'
    ? [...new Set(formState.value.portfolio.map((item) => item.indexCode))]
    : [formState.value.indexCode],
)

const createDcaLeg = (seed?: Partial<DcaPortfolioLeg>): DcaPortfolioLeg => ({
  indexCode: seed?.indexCode ?? 'NDX',
  ratio: seed?.ratio ?? 100,
  amountCny: seed?.amountCny ?? 2000,
})

const syncStrategyKind = (factory: () => BacktestParams) => {
  const next = factory()
  if (next.kind === 'dca' && formState.value.kind === 'dca') {
    next.portfolio = formState.value.portfolio.map((item) => createDcaLeg(item))
  }
  if (next.kind === 'manual' && formState.value.kind === 'manual') {
    next.indexCode = formState.value.indexCode
  }
  return next
}

watch(
  () => formState.value.kind,
  (kind, prev) => {
    if (kind !== prev) {
      formState.value = kind === 'dca'
        ? syncStrategyKind(createDefaultDcaParams)
        : syncStrategyKind(createDefaultManualParams)
    }
  },
)

watch(
  portfolioCodes,
  async (codes) => {
    try {
      await Promise.all(codes.map((code) => dataStore.ensureIndexSeries(code)))
    } catch {
      pageError.value = dataStore.error
    }
  },
  { deep: true },
)

const bootstrap = async () => {
  pageLoading.value = true
  pageError.value = null
  try {
    await dataStore.ensureManifest()
    await dataStore.ensureFxSeries()
    await Promise.all(portfolioCodes.value.map((code) => dataStore.ensureIndexSeries(code)))
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '页面初始化失败'
  } finally {
    pageLoading.value = false
  }
}

onMounted(bootstrap)

const currentMeta = computed(() => dataStore.getIndexMeta(primaryIndexCode.value))
const currentQuality = computed(() => currentMeta.value?.dataQuality ?? null)
const currentPortfolioMeta = computed(() =>
  portfolioCodes.value
    .map((code) => dataStore.getIndexMeta(code))
    .filter((item): item is NonNullable<typeof item> => item != null),
)

const kpis = computed(() => {
  const summary = backtestStore.result?.summary
  return kpiDefinitions.map((definition) => {
    let value = '--'
    if (summary) {
      const raw = summary[definition.key]
      if (
        definition.key === 'totalInvestedCny' ||
        definition.key === 'endingValueCny'
      ) {
        value = formatCompactNumber(Number(raw))
      } else if (definition.key === 'maxDrawdownRecoveryDays') {
        value = formatDays((raw as number | null) ?? null)
      } else {
        value = formatPercent((raw as number | null) ?? null)
      }
    }

    return {
      ...definition,
      value,
    }
  })
})

const curveDates = computed(() => backtestStore.result?.curve.map((item) => item.date) ?? [])

const strategyChartOptions = computed(() => {
  const result = backtestStore.result
  if (!result) return createChartOptions({ title: '资产曲线', dates: [], series: [] })
  return createChartOptions({
    title: '资产曲线（人民币）',
    dates: curveDates.value,
    series: [
      {
        type: 'line',
        name: '累计投入',
        smooth: true,
        showSymbol: false,
        data: result.curve.map((item) => item.investedCny),
      },
      {
        type: 'line',
        name: '策略资产',
        smooth: true,
        showSymbol: false,
        areaStyle: { opacity: 0.08 },
        data: result.curve.map((item) => item.valueCny),
      },
      {
        type: 'line',
        name: '基准资产',
        smooth: true,
        showSymbol: false,
        data: result.curve.map((item) => item.benchmarkValueCny),
      },
      {
        type: 'line',
        name: '超额收益',
        smooth: true,
        showSymbol: false,
        data: result.excessReturnCurve.map((item) => item.excessValueCny),
      },
    ],
  })
})

const drawdownChartOptions = computed(() => {
  const result = backtestStore.result
  if (!result) return createChartOptions({ title: '回撤', dates: [], series: [], valueFormatter: 'percent' })
  const summary = result.summary
  return createChartOptions({
    title: '策略与基准回撤',
    dates: curveDates.value,
    valueFormatter: 'percent',
    series: [
      {
        type: 'line',
        areaStyle: { opacity: 0.08 },
        name: '策略回撤',
        smooth: true,
        showSymbol: false,
        markArea:
          summary.maxDrawdownStartDate && summary.maxDrawdownEndDate
            ? {
                itemStyle: { color: 'rgba(217, 72, 65, 0.08)' },
                data: [[{ xAxis: summary.maxDrawdownStartDate }, { xAxis: summary.maxDrawdownEndDate }]],
              }
            : undefined,
        data: result.curve.map((item) => item.drawdown * 100),
      },
      {
        type: 'line',
        name: '基准回撤',
        smooth: true,
        showSymbol: false,
        data: result.curve.map((item) => item.benchmarkDrawdown * 100),
      },
    ],
  })
})

const yearlyChartOptions = computed(() => {
  const result = backtestStore.result
  if (!result) {
    return createChartOptions({
      title: '年度表现',
      dates: [],
      series: [],
      valueFormatter: 'percent',
      xBoundaryGap: true,
    })
  }
  return createChartOptions({
    title: '年度收益拆解',
    dates: result.yearly.map((item) => String(item.year)),
    valueFormatter: 'percent',
    xBoundaryGap: true,
    series: [
      {
        type: 'bar',
        name: '策略收益率',
        data: result.yearly.map((item) => item.returnRate * 100),
      },
      {
        type: 'bar',
        name: '基准收益率',
        data: result.yearly.map((item) => item.benchmarkReturnRate * 100),
      },
      {
        type: 'line',
        name: '年度最大回撤',
        smooth: true,
        showSymbol: false,
        data: result.yearly.map((item) => item.maxDrawdown * 100),
      },
    ],
  })
})

const holdingChartOptions = computed(() => {
  const result = backtestStore.result
  if (!result) return createDualAxisChartOptions('持仓与仓位', [], [], [])
  return createDualAxisChartOptions(
    '持仓与现金',
    curveDates.value,
    [
      {
        type: 'bar',
        name: '持仓市值',
        data: result.holdingMetrics.map((item) => item.holdingsValueCny),
      },
      {
        type: 'bar',
        name: '现金',
        data: result.holdingMetrics.map((item) => item.cashCny),
      },
    ],
    [
      {
        type: 'line',
        name: '仓位比例',
        smooth: true,
        showSymbol: false,
        data: result.holdingMetrics.map((item) => item.positionRatio * 100),
      },
    ],
  )
})

const tradeChartOptions = computed(() => {
  const result = backtestStore.result
  if (!result) return createChartOptions({ title: '交易标注', dates: [], series: [] })
  const assetSeriesMap = new Map(
    (dataStore.indexSeriesMap[primaryIndexCode.value] ?? []).map((item) => [item.date, item.close]),
  )
  const buyPoints = result.executedTrades
    .filter((item) => item.side === 'buy' && item.indexCode === primaryIndexCode.value)
    .map((item) => [item.date, item.price])
  const sellPoints = result.executedTrades
    .filter((item) => item.side === 'sell' && item.indexCode === primaryIndexCode.value)
    .map((item) => [item.date, item.price])

  return createChartOptions({
    title: `${currentMeta.value?.shortName ?? ''} 价格与交易标注`,
    dates: curveDates.value,
    series: [
      {
        type: 'line',
        name: '指数价格',
        smooth: true,
        showSymbol: false,
        data: curveDates.value.map((date) => assetSeriesMap.get(date) ?? null),
      },
      {
        type: 'scatter',
        name: '买入',
        data: buyPoints,
        symbolSize: 12,
      },
      {
        type: 'scatter',
        name: '卖出',
        data: sellPoints,
        symbolSize: 12,
      },
    ],
  })
})

const assetAllocationChartOptions = computed(() => {
  const result = backtestStore.result
  if (!result) return createChartOptions({ title: '组合资产贡献', dates: [], series: [] })

  const grouped = new Map<string, Partial<Record<IndexCode, number>>>()
  for (const point of result.assetCurves) {
    const bucket = grouped.get(point.date) ?? {}
    bucket[point.indexCode] = point.valueCny
    grouped.set(point.date, bucket)
  }

  return createChartOptions({
    title: '组合资产贡献',
    dates: curveDates.value,
    series: result.assetSummaries.map((summary) => ({
      type: 'line',
      stack: 'assets',
      areaStyle: { opacity: 0.12 },
      name: dataStore.getIndexMeta(summary.indexCode)?.shortName ?? summary.indexCode,
      smooth: true,
      showSymbol: false,
      data: curveDates.value.map((date) => grouped.get(date)?.[summary.indexCode] ?? 0),
    })),
  })
})

const addPortfolioLeg = () => {
  if (formState.value.kind !== 'dca') return
  formState.value.portfolio.push(createDcaLeg())
}

const removePortfolioLeg = (index: number) => {
  if (formState.value.kind !== 'dca') return
  if (formState.value.portfolio.length <= 1) return
  formState.value.portfolio.splice(index, 1)
}

const buildDataset = async (params: BacktestParams): Promise<BacktestDataset> => {
  if (params.kind === 'dca') {
    const uniqueCodes = [...new Set(params.portfolio.map((item) => item.indexCode))]
    await Promise.all(uniqueCodes.map((code) => dataStore.ensureIndexSeries(code)))
    return {
      seriesByCode: Object.fromEntries(
        uniqueCodes.map((code) => [code, dataStore.indexSeriesMap[code] ?? []]),
      ),
      currencyByCode: Object.fromEntries(
        uniqueCodes.map((code) => [code, dataStore.getIndexMeta(code)?.currency]),
      ),
    }
  }

  await dataStore.ensureIndexSeries(params.indexCode)
  return {
    seriesByCode: {
      [params.indexCode]: dataStore.indexSeriesMap[params.indexCode] ?? [],
    },
    currencyByCode: {
      [params.indexCode]: dataStore.getIndexMeta(params.indexCode)?.currency,
    },
  }
}

const runBacktest = async () => {
  try {
    pageError.value = null
    await dataStore.ensureManifest()
    const fxSeries = await dataStore.ensureFxSeries()
    const dataset = await buildDataset(formState.value)

    backtestStore.running = true
    backtestStore.setParams(safeCloneParams(formState.value))
    const result = await worker.runBacktest(formState.value, dataset, fxSeries)
    backtestStore.result = result
    backtestStore.saveRecent(result.summary)
    ElMessage.success('回测完成')
  } catch (error) {
    const message = error instanceof Error ? error.message : '回测失败'
    pageError.value = message
    ElMessage.error(message)
  } finally {
    backtestStore.running = false
  }
}
</script>

<template>
  <AppShell>
    <div class="backtest">
      <aside class="backtest__form">
        <div class="panel">
          <div class="panel__header">
            <h3>回测条件</h3>
            <el-button
              text
              @click="bootstrap"
            >
              重试
            </el-button>
          </div>

          <el-alert
            v-if="pageError"
            :title="pageError"
            type="error"
            :closable="false"
            show-icon
            class="backtest__alert"
          />
          <el-skeleton
            v-else-if="pageLoading"
            :rows="8"
            animated
          />

          <el-form
            v-else
            label-position="top"
          >
            <el-form-item>
              <template #label>
                <div class="field-label">
                  <span>策略类型</span>
                  <InfoTip
                    title="策略类型"
                    content="组合定投会按计划定期买入多个标的；普通买卖则按预设交易清单模拟手工交易。"
                  />
                </div>
              </template>
              <el-radio-group v-model="formState.kind">
                <el-radio-button value="dca">
                  组合定投
                </el-radio-button>
                <el-radio-button value="manual">
                  普通买卖
                </el-radio-button>
              </el-radio-group>
            </el-form-item>

            <template v-if="formState.kind === 'dca'">
              <el-form-item>
                <template #label>
                  <div class="field-label">
                    <span>分配模式</span>
                    <InfoTip
                      title="分配模式"
                      :content="dcaInfo.allocationMode"
                    />
                  </div>
                </template>
                <el-radio-group v-model="formState.allocationMode">
                  <el-radio-button value="ratio">
                    按占比
                  </el-radio-button>
                  <el-radio-button value="amount">
                    按金额
                  </el-radio-button>
                </el-radio-group>
              </el-form-item>

              <el-form-item>
                <template #label>
                  <div class="field-label">
                    <span>日期模式</span>
                    <InfoTip
                      title="日期模式"
                      :content="dcaInfo.dateMode"
                    />
                  </div>
                </template>
                <el-radio-group v-model="formState.dateMode">
                  <el-radio-button value="start-duration">
                    开始日期 + 投资时长
                  </el-radio-button>
                  <el-radio-button value="end-recent">
                    结束日期 + 近 X 年
                  </el-radio-button>
                </el-radio-group>
              </el-form-item>

              <div class="backtest__range-grid">
                <el-form-item v-if="formState.dateMode === 'start-duration'">
                  <template #label>
                    <div class="field-label">
                      <span>开始日期</span>
                      <InfoTip
                        title="开始日期"
                        :content="dcaInfo.startDate"
                      />
                    </div>
                  </template>
                  <el-date-picker
                    v-model="formState.startDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                  />
                </el-form-item>
                <el-form-item v-if="formState.dateMode === 'start-duration'">
                  <template #label>
                    <div class="field-label">
                      <span>投资时长（年）</span>
                      <InfoTip
                        title="投资时长"
                        :content="dcaInfo.durationYears"
                      />
                    </div>
                  </template>
                  <el-input-number
                    v-model="formState.durationYears"
                    :min="1"
                    :max="30"
                    :step="1"
                  />
                </el-form-item>
                <el-form-item v-if="formState.dateMode === 'end-recent'">
                  <template #label>
                    <div class="field-label">
                      <span>结束日期</span>
                      <InfoTip
                        title="结束日期"
                        :content="dcaInfo.endDate"
                      />
                    </div>
                  </template>
                  <el-date-picker
                    v-model="formState.endDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                  />
                </el-form-item>
                <el-form-item v-if="formState.dateMode === 'end-recent'">
                  <template #label>
                    <div class="field-label">
                      <span>近 X 年</span>
                      <InfoTip
                        title="近 X 年"
                        :content="dcaInfo.recentYears"
                      />
                    </div>
                  </template>
                  <el-input-number
                    v-model="formState.recentYears"
                    :min="1"
                    :max="30"
                    :step="1"
                  />
                </el-form-item>
              </div>

              <el-form-item v-if="formState.allocationMode === 'ratio'">
                <template #label>
                  <div class="field-label">
                    <span>每期定投总额（人民币）</span>
                    <InfoTip
                      title="每期定投总额"
                      :content="dcaInfo.periodicTotalAmount"
                    />
                  </div>
                </template>
                <el-input-number
                  v-model="formState.periodicTotalAmountCny"
                  :min="100"
                  :step="100"
                />
              </el-form-item>

              <el-form-item>
                <template #label>
                  <div class="field-label">
                    <span>频率</span>
                    <InfoTip
                      title="频率"
                      :content="dcaInfo.frequency"
                    />
                  </div>
                </template>
                <el-select v-model="formState.frequency">
                  <el-option
                    label="每交易日"
                    value="daily"
                  />
                  <el-option
                    label="每周"
                    value="weekly"
                  />
                  <el-option
                    label="每双周"
                    value="biweekly"
                  />
                  <el-option
                    label="每月"
                    value="monthly"
                  />
                </el-select>
              </el-form-item>

              <div class="portfolio-panel">
                <div class="panel__header">
                  <h4>定投组合</h4>
                  <el-button
                    text
                    @click="addPortfolioLeg"
                  >
                    新增标的
                  </el-button>
                </div>
                <div
                  v-for="(leg, index) in formState.portfolio"
                  :key="`${leg.indexCode}-${index}`"
                  class="portfolio-leg"
                >
                  <el-form-item>
                    <template #label>
                      <div class="field-label">
                        <span>指数</span>
                        <InfoTip
                          title="指数"
                          :content="dcaInfo.indexSelection"
                        />
                      </div>
                    </template>
                    <el-select
                      v-model="leg.indexCode"
                      placeholder="请选择指数"
                    >
                      <el-option
                        v-for="item in dataStore.manifest?.indices ?? []"
                        :key="item.code"
                        :label="item.name"
                        :value="item.code"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item v-if="formState.allocationMode === 'ratio'">
                    <template #label>
                      <div class="field-label">
                        <span>占比（%）</span>
                        <InfoTip
                          title="占比"
                          :content="dcaInfo.ratio"
                        />
                      </div>
                    </template>
                    <el-input-number
                      v-model="leg.ratio"
                      :min="0"
                      :max="100"
                      :step="5"
                    />
                  </el-form-item>
                  <el-form-item v-else>
                    <template #label>
                      <div class="field-label">
                        <span>每期金额（人民币）</span>
                        <InfoTip
                          title="每期金额"
                          :content="dcaInfo.amount"
                        />
                      </div>
                    </template>
                    <el-input-number
                      v-model="leg.amountCny"
                      :min="0"
                      :step="100"
                    />
                  </el-form-item>
                  <el-button
                    text
                    type="danger"
                    :disabled="formState.portfolio.length <= 1"
                    @click="removePortfolioLeg(index)"
                  >
                    删除
                  </el-button>
                </div>
              </div>
            </template>

            <template v-else>
              <el-form-item>
                <template #label>
                  <div class="field-label">
                    <span>指数</span>
                    <InfoTip
                      title="指数"
                      :content="dcaInfo.indexSelection"
                    />
                  </div>
                </template>
                <el-select
                  v-model="formState.indexCode"
                  placeholder="请选择指数"
                >
                  <el-option
                    v-for="item in dataStore.manifest?.indices ?? []"
                    :key="item.code"
                    :label="item.name"
                    :value="item.code"
                  />
                </el-select>
              </el-form-item>

              <el-form-item>
                <template #label>
                  <div class="field-label">
                    <span>初始资金（人民币）</span>
                    <InfoTip
                      title="初始资金"
                      :content="dcaInfo.initialCash"
                    />
                  </div>
                </template>
                <el-input-number
                  v-model="formState.initialCashCny"
                  :min="0"
                  :step="1000"
                />
              </el-form-item>
              <el-alert
                title="当前版本普通买卖仍使用内嵌交易清单，后续可继续扩展为可编辑表格。"
                type="info"
                :closable="false"
                show-icon
              />
            </template>

            <el-divider />

            <el-form-item>
              <template #label>
                <div class="field-label">
                  <span>费率</span>
                  <InfoTip
                    title="费率"
                    :content="dcaInfo.feeRate"
                  />
                </div>
              </template>
              <el-input-number
                v-model="formState.feeRate"
                :min="0"
                :max="0.1"
                :step="0.001"
              />
            </el-form-item>
            <el-form-item>
              <template #label>
                <div class="field-label">
                  <span>固定费用</span>
                  <InfoTip
                    title="固定费用"
                    :content="dcaInfo.feeFixed"
                  />
                </div>
              </template>
              <el-input-number
                v-model="formState.feeFixed"
                :min="0"
                :step="1"
              />
            </el-form-item>
            <el-form-item>
              <template #label>
                <div class="field-label">
                  <span>滑点（bps）</span>
                  <InfoTip
                    title="滑点"
                    :content="dcaInfo.slippage"
                  />
                </div>
              </template>
              <el-input-number
                v-model="formState.slippageBps"
                :min="0"
                :step="1"
              />
            </el-form-item>

            <el-button
              type="primary"
              :loading="isBacktestBusy"
              @click="runBacktest"
            >
              开始回测
            </el-button>
          </el-form>
        </div>

        <div
          v-if="currentPortfolioMeta.length > 0"
          class="panel"
        >
          <div class="panel__header">
            <h3>数据质量</h3>
            <span
              class="quality-tag"
              :class="`is-${currentQuality?.validationStatus}`"
            >
              {{ formatValidationStatus(currentQuality?.validationStatus) }}
            </span>
          </div>
          <div class="quality-list">
            <div
              v-for="item in currentPortfolioMeta"
              :key="item.code"
              class="quality-item"
            >
              <div class="quality-item__head">
                <strong>{{ item.shortName }}</strong>
                <span>{{ formatValidationStatus(item.dataQuality.validationStatus) }}</span>
              </div>
              <div class="quality-item__meta">
                {{ item.startDate }} ~ {{ item.latestDate }} / 点数 {{ formatNumber(item.pointCount, 0) }}
              </div>
              <div class="quality-item__meta">
                缺口 {{ formatNumber(item.dataQuality.missingRangeCount, 0) }} / 滞后 {{ formatDays(item.dataQuality.staleDays) }}
              </div>
            </div>
          </div>
          <p class="quality-message">
            {{ currentQuality?.message }}
          </p>
        </div>
      </aside>

      <section class="backtest__content">
        <div class="backtest__kpis">
          <article
            v-for="kpi in kpis"
            :key="kpi.label"
            class="panel"
          >
            <div class="kpi-label">
              <span>{{ kpi.label }}</span>
              <InfoTip
                :title="kpi.label"
                :content="kpi.tip"
              />
            </div>
            <div class="kpi-value">
              {{ kpi.value }}
            </div>
          </article>
        </div>

        <div class="panel">
          <div class="panel__header">
            <div class="panel-title">
              <h3>分析维度</h3>
              <InfoTip
                title="基准说明"
                :content="dcaInfo.benchmark"
              />
            </div>
            <div
              v-if="backtestStore.result"
              class="range-label"
            >
              {{ backtestStore.result.resolvedRange.label }}
            </div>
          </div>
          <el-segmented
            v-model="activeView"
            :options="[
              { label: '策略表现', value: 'strategy' },
              { label: '基准对比', value: 'benchmark' },
              { label: '风险分析', value: 'risk' },
              { label: '年度拆解', value: 'yearly' },
            ]"
          />
        </div>

        <template v-if="backtestStore.result">
          <div class="panel">
            <div class="panel__header">
              <div class="panel-title">
                <h3>组合贡献</h3>
                <InfoTip
                  title="组合贡献"
                  content="该图展示每个标的在各日期为组合贡献了多少资产市值，适合观察哪个资产主导了净值变化。"
                />
              </div>
            </div>
            <VChart
              autoresize
              class="chart"
              :option="assetAllocationChartOptions"
            />
          </div>

          <div
            v-if="activeView === 'strategy'"
            class="backtest__charts"
          >
            <div class="panel chart-panel">
              <div class="panel__header">
                <div class="panel-title">
                  <h3>资产曲线</h3>
                  <InfoTip
                    title="资产曲线"
                    content="资产曲线同时展示累计投入、策略资产、基准资产和超额收益，可直接对比组合净值和资金投入节奏。"
                  />
                </div>
              </div>
              <VChart
                autoresize
                class="chart chart--lg"
                :option="strategyChartOptions"
              />
            </div>
            <div class="panel chart-panel">
              <div class="panel__header">
                <div class="panel-title">
                  <h3>持仓与现金</h3>
                  <InfoTip
                    title="持仓与仓位"
                    :content="`${dcaInfo.holdingsValue} ${dcaInfo.cash} ${dcaInfo.positionRatio}`"
                  />
                </div>
              </div>
              <VChart
                autoresize
                class="chart"
                :option="holdingChartOptions"
              />
            </div>
          </div>

          <div
            v-else-if="activeView === 'benchmark'"
            class="backtest__charts"
          >
            <div class="panel chart-panel">
              <VChart
                autoresize
                class="chart chart--lg"
                :option="strategyChartOptions"
              />
            </div>
            <div class="panel chart-panel">
              <div class="panel__header">
                <div class="panel-title">
                  <h3>交易标注</h3>
                  <InfoTip
                    title="交易标注"
                    :content="dcaInfo.indexPrice"
                  />
                </div>
              </div>
              <VChart
                autoresize
                class="chart"
                :option="tradeChartOptions"
              />
            </div>
          </div>

          <div
            v-else-if="activeView === 'risk'"
            class="backtest__charts"
          >
            <div class="panel chart-panel">
              <div class="panel__header">
                <div class="panel-title">
                  <h3>回撤分析</h3>
                  <InfoTip
                    title="回撤分析"
                    :content="dcaInfo.drawdown"
                  />
                </div>
              </div>
              <VChart
                autoresize
                class="chart chart--lg"
                :option="drawdownChartOptions"
              />
            </div>
            <div class="panel metrics-panel">
              <article class="metric-line">
                <span class="metric-label">
                  最大回撤区间
                  <InfoTip
                    title="最大回撤区间"
                    :content="dcaInfo.drawdownWindow"
                  />
                </span>
                <strong>
                  {{ backtestStore.result.summary.maxDrawdownStartDate ? formatDate(backtestStore.result.summary.maxDrawdownStartDate) : '--' }}
                  -
                  {{ backtestStore.result.summary.maxDrawdownEndDate ? formatDate(backtestStore.result.summary.maxDrawdownEndDate) : '--' }}
                </strong>
              </article>
              <article class="metric-line">
                <span class="metric-label">
                  修复日期
                  <InfoTip
                    title="修复日期"
                    :content="dcaInfo.recoveryDate"
                  />
                </span>
                <strong>{{ backtestStore.result.summary.maxDrawdownRecoveryDate ? formatDate(backtestStore.result.summary.maxDrawdownRecoveryDate) : '--' }}</strong>
              </article>
              <article class="metric-line">
                <span class="metric-label">
                  年化波动率
                  <InfoTip
                    title="年化波动率"
                    :content="dcaInfo.annualVolatility"
                  />
                </span>
                <strong>{{ formatPercent(backtestStore.result.summary.volatility) }}</strong>
              </article>
              <article class="metric-line">
                <span class="metric-label">
                  年度胜率
                  <InfoTip
                    title="年度胜率"
                    :content="dcaInfo.winRateByYear"
                  />
                </span>
                <strong>{{ formatPercent(backtestStore.result.summary.winRateByYear) }}</strong>
              </article>
              <article class="metric-line">
                <span class="metric-label">
                  持仓天数
                  <InfoTip
                    title="持仓天数"
                    :content="dcaInfo.holdingDays"
                  />
                </span>
                <strong>{{ formatDays(backtestStore.result.summary.holdingDays) }}</strong>
              </article>
            </div>
          </div>

          <div
            v-else
            class="backtest__charts"
          >
            <div class="panel chart-panel">
              <VChart
                autoresize
                class="chart chart--lg"
                :option="yearlyChartOptions"
              />
            </div>
            <div class="panel">
              <el-table :data="backtestStore.result.yearly">
                <el-table-column
                  prop="year"
                  label="年度"
                  min-width="100"
                />
                <el-table-column
                  label="收益率"
                  min-width="120"
                >
                  <template #header>
                    <div class="table-head">
                      <span>收益率</span>
                      <InfoTip
                        title="年度收益率"
                        :content="dcaInfo.yearlyReturn"
                      />
                    </div>
                  </template>
                  <template #default="{ row }">
                    {{ formatPercent(row.returnRate) }}
                  </template>
                </el-table-column>
                <el-table-column
                  label="基准收益率"
                  min-width="120"
                >
                  <template #header>
                    <div class="table-head">
                      <span>基准收益率</span>
                      <InfoTip
                        title="基准收益率"
                        :content="dcaInfo.benchmarkReturn"
                      />
                    </div>
                  </template>
                  <template #default="{ row }">
                    {{ formatPercent(row.benchmarkReturnRate) }}
                  </template>
                </el-table-column>
                <el-table-column
                  label="超额收益"
                  min-width="120"
                >
                  <template #header>
                    <div class="table-head">
                      <span>超额收益</span>
                      <InfoTip
                        title="超额收益"
                        :content="dcaInfo.excessReturn"
                      />
                    </div>
                  </template>
                  <template #default="{ row }">
                    {{ formatPercent(row.excessReturnRate) }}
                  </template>
                </el-table-column>
                <el-table-column
                  label="最大回撤"
                  min-width="120"
                >
                  <template #header>
                    <div class="table-head">
                      <span>最大回撤</span>
                      <InfoTip
                        title="年度最大回撤"
                        :content="dcaInfo.yearlyDrawdown"
                      />
                    </div>
                  </template>
                  <template #default="{ row }">
                    {{ formatPercent(row.maxDrawdown) }}
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>

          <div class="panel">
            <div class="panel__header">
              <h3>组合分项表现</h3>
            </div>
            <el-table :data="backtestStore.result.assetSummaries">
              <el-table-column
                prop="indexCode"
                label="标的"
                min-width="120"
              />
              <el-table-column
                label="累计投入"
                min-width="120"
              >
                <template #header>
                  <div class="table-head">
                    <span>累计投入</span>
                    <InfoTip
                      title="累计投入"
                      :content="dcaInfo.investedAmount"
                    />
                  </div>
                </template>
                <template #default="{ row }">
                  {{ formatCompactNumber(row.investedCny) }}
                </template>
              </el-table-column>
              <el-table-column
                label="期末资产"
                min-width="120"
              >
                <template #header>
                  <div class="table-head">
                    <span>期末资产</span>
                    <InfoTip
                      title="期末资产"
                      :content="dcaInfo.endingValue"
                    />
                  </div>
                </template>
                <template #default="{ row }">
                  {{ formatCompactNumber(row.endingValueCny) }}
                </template>
              </el-table-column>
              <el-table-column
                label="收益率"
                min-width="120"
              >
                <template #header>
                  <div class="table-head">
                    <span>收益率</span>
                    <InfoTip
                      title="收益率"
                      :content="dcaInfo.assetReturn"
                    />
                  </div>
                </template>
                <template #default="{ row }">
                  {{ formatPercent(row.returnRate) }}
                </template>
              </el-table-column>
              <el-table-column
                prop="tradeCount"
                min-width="120"
              >
                <template #header>
                  <div class="table-head">
                    <span>成交次数</span>
                    <InfoTip
                      title="成交次数"
                      :content="dcaInfo.tradeCount"
                    />
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="panel">
            <div class="panel__header">
              <h3>交易明细</h3>
            </div>
            <el-table :data="backtestStore.result.executedTrades">
              <el-table-column
                prop="date"
                label="日期"
                min-width="140"
              />
              <el-table-column
                prop="indexCode"
                label="标的"
                min-width="120"
              />
              <el-table-column
                label="方向"
                min-width="90"
              >
                <template #default="{ row }">
                  {{ formatTradeSide(row.side) }}
                </template>
              </el-table-column>
              <el-table-column
                label="份额"
                min-width="120"
              >
                <template #default="{ row }">
                  {{ formatNullableNumber(row.units, 4) }}
                </template>
              </el-table-column>
              <el-table-column
                label="价格"
                min-width="120"
              >
                <template #default="{ row }">
                  {{ formatNullableNumber(row.price, 2) }}
                </template>
              </el-table-column>
              <el-table-column
                label="投入金额"
                min-width="120"
              >
                <template #header>
                  <div class="table-head">
                    <span>投入金额</span>
                    <InfoTip
                      title="投入金额"
                      :content="dcaInfo.executedAmount"
                    />
                  </div>
                </template>
                <template #default="{ row }">
                  {{ formatCompactNumber(row.grossAmountCny) }}
                </template>
              </el-table-column>
              <el-table-column
                label="汇率"
                min-width="120"
              >
                <template #header>
                  <div class="table-head">
                    <span>汇率</span>
                    <InfoTip
                      title="汇率"
                      :content="dcaInfo.fxRate"
                    />
                  </div>
                </template>
                <template #default="{ row }">
                  {{ formatNullableNumber(row.fx ?? null, 4) }}
                </template>
              </el-table-column>
            </el-table>
          </div>
        </template>

        <div
          v-else
          class="panel backtest__empty"
        >
          <h3>尚未生成回测结果</h3>
          <p>完成参数设置后运行回测，这里会展示策略、基准、风险、组合贡献和年度拆解结果。</p>
        </div>

        <div class="panel">
          <div class="panel__header">
            <h3>最近回测</h3>
          </div>
          <el-table :data="backtestStore.recent">
            <el-table-column
              label="时间"
              min-width="180"
            >
              <template #default="{ row }">
                {{ formatDateTime(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column
              prop="label"
              label="组合 / 指数"
              min-width="180"
            />
            <el-table-column
              label="策略"
              min-width="100"
            >
              <template #default="{ row }">
                {{ formatStrategyKind(row.params.kind) }}
              </template>
            </el-table-column>
            <el-table-column
              label="总收益率"
              min-width="120"
            >
              <template #default="{ row }">
                {{ formatPercent(row.summary.totalReturnRate) }}
              </template>
            </el-table-column>
            <el-table-column
              label="最大回撤"
              min-width="120"
            >
              <template #default="{ row }">
                {{ formatPercent(row.summary.maxDrawdown) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>
    </div>
  </AppShell>
</template>

<style scoped lang="scss">
.backtest {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 20px;
}

.panel {
  border: 1px solid var(--cow-border);
  border-radius: var(--cow-radius);
  padding: 20px;
  background: var(--cow-surface);
  box-shadow: var(--cow-shadow);
}

.backtest__form,
.backtest__content,
.backtest__charts {
  display: grid;
  gap: 16px;
}

.backtest__kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.panel__header,
.panel-title,
.field-label,
.quality-item__head,
.kpi-label,
.metric-label,
.table-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel__header {
  justify-content: space-between;
}

.backtest__range-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.portfolio-panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(15, 118, 110, 0.04);
}

.portfolio-leg {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
}

.quality-list,
.metrics-panel {
  display: grid;
  gap: 12px;
}

.quality-item {
  padding: 12px;
  border-radius: 14px;
  background: rgba(23, 59, 57, 0.04);
}

.quality-item__meta,
.quality-message,
.range-label {
  color: var(--cow-text-soft);
}

.kpi-label {
  justify-content: space-between;
  color: var(--cow-text-soft);
}

.kpi-value {
  margin-top: 10px;
  font-size: 28px;
  font-weight: 900;
}

.quality-tag {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  background: rgba(15, 118, 110, 0.12);
}

.quality-tag.is-warning {
  background: rgba(201, 138, 46, 0.14);
}

.quality-tag.is-error {
  color: #b42318;
  background: rgba(217, 72, 65, 0.14);
}

.chart {
  height: 360px;
}

.chart--lg {
  height: 420px;
}

.metric-line {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.table-head {
  line-height: 1.2;
}

.backtest__empty {
  display: grid;
  gap: 8px;
  place-items: start;
}

@media (max-width: 1279px) {
  .backtest {
    grid-template-columns: 1fr;
  }

  .backtest__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .backtest__kpis,
  .backtest__range-grid,
  .portfolio-leg {
    grid-template-columns: 1fr;
  }

  .chart,
  .chart--lg {
    height: 300px;
  }
}
</style>
