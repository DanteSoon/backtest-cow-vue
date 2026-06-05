<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import { ElMessage } from 'element-plus'
import AppShell from '@/shared/components/AppShell.vue'
import { useBacktestWorker } from '@/shared/composables/use-backtest-worker'
import {
  createDefaultDcaParams,
  createDefaultManualParams,
  useBacktestStore,
} from '@/shared/stores/backtest'
import { useDataStore } from '@/shared/stores/data'
import type { BacktestParams, IndexCode } from '@/shared/types/domain'
import { createChartOptions, createDualAxisChartOptions } from '@/shared/utils/chart'
import {
  formatCompactNumber,
  formatDate,
  formatDays,
  formatNullableNumber,
  formatNumber,
  formatPercent,
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

const syncIndexCode = (factory: () => BacktestParams) => {
  const next = factory()
  next.indexCode = formState.value.indexCode
  return next
}

watch(
  () => formState.value.kind,
  (kind, prev) => {
    if (kind !== prev) {
      formState.value = kind === 'dca'
        ? syncIndexCode(createDefaultDcaParams)
        : syncIndexCode(createDefaultManualParams)
    }
  },
)

watch(
  () => formState.value.indexCode,
  async (code) => {
    if (!code) return
    try {
      await dataStore.ensureIndexSeries(code as IndexCode)
    } catch {
      pageError.value = dataStore.error
    }
  },
)

const bootstrap = async () => {
  pageLoading.value = true
  pageError.value = null
  try {
    await dataStore.ensureManifest()
    await dataStore.ensureFxSeries()
    await dataStore.ensureIndexSeries(formState.value.indexCode)
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '页面初始化失败'
  } finally {
    pageLoading.value = false
  }
}

onMounted(bootstrap)

const currentMeta = computed(() => dataStore.getIndexMeta(formState.value.indexCode))
const currentQuality = computed(() => currentMeta.value?.dataQuality ?? null)

const kpis = computed(() => {
  const summary = backtestStore.result?.summary
  return [
    { label: '累计投入', value: summary ? formatCompactNumber(summary.totalInvestedCny) : '--' },
    { label: '期末资产', value: summary ? formatCompactNumber(summary.endingValueCny) : '--' },
    { label: '总收益率', value: summary ? formatPercent(summary.totalReturnRate) : '--' },
    { label: '年化收益', value: summary ? formatPercent(summary.annualizedReturn) : '--' },
    { label: 'XIRR', value: summary ? formatPercent(summary.xirr) : '--' },
    { label: '最大回撤', value: summary ? formatPercent(summary.maxDrawdown) : '--' },
    { label: '回撤修复时间', value: summary ? formatDays(summary.maxDrawdownRecoveryDays) : '--' },
    { label: '当前回撤', value: summary ? formatPercent(summary.currentDrawdown) : '--' },
    { label: '相对基准超额', value: summary ? formatPercent(summary.excessReturnRate) : '--' },
  ]
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
  if (!result) return createChartOptions({ title: '年度表现', dates: [], series: [], valueFormatter: 'percent', xBoundaryGap: true })
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
  const buyPoints = result.executedTrades
    .filter((item) => item.side === 'buy')
    .map((item) => [item.date, item.price])
  const sellPoints = result.executedTrades
    .filter((item) => item.side === 'sell')
    .map((item) => [item.date, item.price])

  return createChartOptions({
    title: '价格与交易标注',
    dates: curveDates.value,
    series: [
      {
        type: 'line',
        name: '指数价格',
        smooth: true,
        showSymbol: false,
        data: backtestStore.result?.executedTrades.length
          ? (dataStore.indexSeriesMap[formState.value.indexCode] ?? [])
              .filter((item) => curveDates.value.includes(item.date))
              .map((item) => item.close)
          : [],
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

const runBacktest = async () => {
  try {
    pageError.value = null
    const manifest = await dataStore.ensureManifest()
    const current = manifest.indices.find((item) => item.code === formState.value.indexCode)
    if (!current) throw new Error('未找到指数元数据')
    const series = await dataStore.ensureIndexSeries(formState.value.indexCode)
    const fxSeries = await dataStore.ensureFxSeries()
    const requestedStartDate =
      formState.value.kind === 'dca'
        ? formState.value.startDate
        : formState.value.trades[0]?.date ?? series[0]?.date

    if (current.currency === 'USD' && fxSeries[0] && requestedStartDate < fxSeries[0].date) {
      throw new Error(`当前 USD/CNY 历史汇率从 ${fxSeries[0].date} 开始，美股人民币折算回测请晚于该日期`)
    }

    backtestStore.running = true
    backtestStore.setParams(safeCloneParams(formState.value))
    const result = await worker.runBacktest(formState.value, series, fxSeries, current.currency)
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
            <el-button text @click="bootstrap">重试</el-button>
          </div>

          <el-alert
            v-if="pageError"
            :title="pageError"
            type="error"
            :closable="false"
            show-icon
            class="backtest__alert"
          />
          <el-skeleton v-else-if="pageLoading" :rows="8" animated />

          <el-form v-else label-position="top">
            <el-form-item label="指数">
              <el-select v-model="formState.indexCode" placeholder="请选择指数">
                <el-option
                  v-for="item in dataStore.manifest?.indices ?? []"
                  :key="item.code"
                  :label="item.name"
                  :value="item.code"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="策略类型">
              <el-radio-group v-model="formState.kind">
                <el-radio-button value="dca">定投</el-radio-button>
                <el-radio-button value="manual">普通买卖</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <template v-if="formState.kind === 'dca'">
              <el-form-item label="开始日期">
                <el-date-picker v-model="formState.startDate" type="date" value-format="YYYY-MM-DD" />
              </el-form-item>
              <el-form-item label="结束日期">
                <el-date-picker v-model="formState.endDate" type="date" value-format="YYYY-MM-DD" />
              </el-form-item>
              <el-form-item label="每次投入金额（人民币）">
                <el-input-number v-model="formState.amountCny" :min="100" :step="100" />
              </el-form-item>
              <el-form-item label="频率">
                <el-select v-model="formState.frequency">
                  <el-option label="每交易日" value="daily" />
                  <el-option label="每周" value="weekly" />
                  <el-option label="每双周" value="biweekly" />
                  <el-option label="每月" value="monthly" />
                </el-select>
              </el-form-item>
            </template>

            <template v-else>
              <el-form-item label="初始资金（人民币）">
                <el-input-number v-model="formState.initialCashCny" :min="0" :step="1000" />
              </el-form-item>
              <el-alert
                title="当前版本使用默认内嵌交易清单，后续可继续扩展为可编辑表格。"
                type="info"
                :closable="false"
                show-icon
              />
            </template>

            <el-divider />

            <el-form-item label="费率">
              <el-input-number v-model="formState.feeRate" :min="0" :max="0.1" :step="0.001" />
            </el-form-item>
            <el-form-item label="固定费用">
              <el-input-number v-model="formState.feeFixed" :min="0" :step="1" />
            </el-form-item>
            <el-form-item label="滑点（bps）">
              <el-input-number v-model="formState.slippageBps" :min="0" :step="1" />
            </el-form-item>

            <el-button type="primary" :loading="isBacktestBusy" @click="runBacktest">
              开始回测
            </el-button>
          </el-form>
        </div>

        <div class="panel" v-if="currentMeta">
          <div class="panel__header">
            <h3>数据质量</h3>
            <span class="quality-tag" :class="`is-${currentQuality?.validationStatus}`">
              {{ currentQuality?.validationStatus ?? '--' }}
            </span>
          </div>
          <div class="quality-grid">
            <div>
              <div class="kpi-label">数据范围</div>
              <div class="quality-value">{{ currentMeta.startDate }} ~ {{ currentMeta.latestDate }}</div>
            </div>
            <div>
              <div class="kpi-label">点数</div>
              <div class="quality-value">{{ formatNumber(currentMeta.pointCount, 0) }}</div>
            </div>
            <div>
              <div class="kpi-label">疑似缺口</div>
              <div class="quality-value">{{ currentQuality?.missingRangeCount ?? 0 }}</div>
            </div>
            <div>
              <div class="kpi-label">最新滞后</div>
              <div class="quality-value">{{ formatDays(currentQuality?.staleDays ?? null) }}</div>
            </div>
          </div>
          <p class="quality-message">{{ currentQuality?.message }}</p>
        </div>
      </aside>

      <section class="backtest__content">
        <div class="backtest__kpis">
          <article v-for="kpi in kpis" :key="kpi.label" class="panel">
            <div class="kpi-label">{{ kpi.label }}</div>
            <div class="kpi-value">{{ kpi.value }}</div>
          </article>
        </div>

        <div class="panel">
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
          <div class="backtest__charts" v-if="activeView === 'strategy'">
            <div class="panel chart-panel">
              <VChart autoresize class="chart chart--lg" :option="strategyChartOptions" />
            </div>
            <div class="panel chart-panel">
              <VChart autoresize class="chart" :option="holdingChartOptions" />
            </div>
          </div>

          <div class="backtest__charts" v-else-if="activeView === 'benchmark'">
            <div class="panel chart-panel">
              <VChart autoresize class="chart chart--lg" :option="strategyChartOptions" />
            </div>
            <div class="panel chart-panel">
              <VChart autoresize class="chart" :option="tradeChartOptions" />
            </div>
          </div>

          <div class="backtest__charts" v-else-if="activeView === 'risk'">
            <div class="panel chart-panel">
              <VChart autoresize class="chart chart--lg" :option="drawdownChartOptions" />
            </div>
            <div class="panel metrics-panel">
              <article class="metric-line">
                <span>最大回撤区间</span>
                <strong>
                  {{ backtestStore.result.summary.maxDrawdownStartDate ? formatDate(backtestStore.result.summary.maxDrawdownStartDate) : '--' }}
                  -
                  {{ backtestStore.result.summary.maxDrawdownEndDate ? formatDate(backtestStore.result.summary.maxDrawdownEndDate) : '--' }}
                </strong>
              </article>
              <article class="metric-line">
                <span>修复日期</span>
                <strong>{{ backtestStore.result.summary.maxDrawdownRecoveryDate ? formatDate(backtestStore.result.summary.maxDrawdownRecoveryDate) : '--' }}</strong>
              </article>
              <article class="metric-line">
                <span>年化波动率</span>
                <strong>{{ formatPercent(backtestStore.result.summary.volatility) }}</strong>
              </article>
              <article class="metric-line">
                <span>年度胜率</span>
                <strong>{{ formatPercent(backtestStore.result.summary.winRateByYear) }}</strong>
              </article>
              <article class="metric-line">
                <span>持仓天数</span>
                <strong>{{ formatDays(backtestStore.result.summary.holdingDays) }}</strong>
              </article>
            </div>
          </div>

          <div class="backtest__charts" v-else>
            <div class="panel chart-panel">
              <VChart autoresize class="chart chart--lg" :option="yearlyChartOptions" />
            </div>
            <div class="panel">
              <el-table :data="backtestStore.result.yearly">
                <el-table-column prop="year" label="年度" min-width="100" />
                <el-table-column label="收益率" min-width="120">
                  <template #default="{ row }">
                    {{ formatPercent(row.returnRate) }}
                  </template>
                </el-table-column>
                <el-table-column label="基准收益率" min-width="120">
                  <template #default="{ row }">
                    {{ formatPercent(row.benchmarkReturnRate) }}
                  </template>
                </el-table-column>
                <el-table-column label="超额收益" min-width="120">
                  <template #default="{ row }">
                    {{ formatPercent(row.excessReturnRate) }}
                  </template>
                </el-table-column>
                <el-table-column label="最大回撤" min-width="120">
                  <template #default="{ row }">
                    {{ formatPercent(row.maxDrawdown) }}
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>

          <div class="panel">
            <div class="panel__header">
              <h3>交易明细</h3>
            </div>
            <el-table :data="backtestStore.result.executedTrades">
              <el-table-column prop="date" label="日期" min-width="140" />
              <el-table-column prop="side" label="方向" min-width="90" />
              <el-table-column label="份额" min-width="120">
                <template #default="{ row }">
                  {{ formatNullableNumber(row.units, 4) }}
                </template>
              </el-table-column>
              <el-table-column label="价格" min-width="120">
                <template #default="{ row }">
                  {{ formatNullableNumber(row.price, 2) }}
                </template>
              </el-table-column>
              <el-table-column label="汇率" min-width="120">
                <template #default="{ row }">
                  {{ formatNullableNumber(row.fx ?? null, 4) }}
                </template>
              </el-table-column>
            </el-table>
          </div>
        </template>

        <div v-else class="panel backtest__empty">
          <h3>尚未生成回测结果</h3>
          <p>完成参数设置后运行回测，这里会展示策略、基准、风险和年度拆解结果。</p>
        </div>

        <div class="panel">
          <div class="panel__header">
            <h3>最近回测</h3>
          </div>
          <el-table :data="backtestStore.recent">
            <el-table-column prop="createdAt" label="时间" min-width="180" />
            <el-table-column prop="params.indexCode" label="指数" min-width="100" />
            <el-table-column prop="params.kind" label="策略" min-width="100" />
            <el-table-column label="总收益率" min-width="120">
              <template #default="{ row }">
                {{ formatPercent(row.summary.totalReturnRate) }}
              </template>
            </el-table-column>
            <el-table-column label="最大回撤" min-width="120">
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

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.backtest__alert {
  margin-bottom: 16px;
}

.kpi-label {
  color: var(--cow-text-soft);
}

.kpi-value,
.quality-value {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 900;
}

.quality-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.quality-message {
  margin: 16px 0 0;
  color: var(--cow-text-soft);
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
  height: 340px;
}

.chart--lg {
  height: 420px;
}

.metrics-panel {
  display: grid;
  gap: 14px;
}

.metric-line {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(220, 207, 183, 0.7);
}

.backtest__empty {
  text-align: center;
  padding: 48px 24px;
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
  .quality-grid {
    grid-template-columns: 1fr;
  }

  .chart,
  .chart--lg {
    height: 300px;
  }

  .metric-line {
    display: grid;
  }
}
</style>
