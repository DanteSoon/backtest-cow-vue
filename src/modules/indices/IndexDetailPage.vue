<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import VChart from 'vue-echarts'
import AppShell from '@/shared/components/AppShell.vue'
import InfoTip from '@/shared/components/InfoTip.vue'
import { useDataStore } from '@/shared/stores/data'
import type { IndexCode } from '@/shared/types/domain'
import { createChartOptions, createDualAxisChartOptions } from '@/shared/utils/chart'
import { formatDate, formatDays, formatNumber, formatPercent, formatValidationStatus } from '@/shared/utils/formatters'
import { percentChange } from '@/shared/utils/math'
import { calcReturnFromBase, rollingWindow } from '@/shared/utils/series'

const route = useRoute()
const dataStore = useDataStore()

const explainers = {
  oneYearReturn: '近1年表现按最近收盘价和约 252 个交易日前的收盘价比较，反映过去一年的累计涨跌幅。',
  quality: '数据质量会检查字段完整性、真实缺口、已确认休市区间和数据是否新鲜。',
  highest: '历史最高表示当前本地样本区间内出现过的最高收盘价，不代表盘中最高点历史纪录。',
  lowest: '历史最低表示当前本地样本区间内出现过的最低收盘价，不代表盘中最低点历史纪录。',
  pointCount: '点数是本地保存的交易日数据条数，通常可近似理解为样本覆盖了多少个交易日。',
  missingRange: '疑似缺口表示按交易日历推断本应存在但当前数据中缺失的区间数量；已确认休市不会计入真实问题。',
  staleDays: '滞后表示距离最近一个应更新交易日大约落后了多少个工作日，数值越大越需要重新拉取数据。',
  returnChart: '区间收益率以样本起点为基准，展示从起点持有到各日期的累计涨跌幅。',
  rollingVol: '21日滚动波动率使用最近 21 个交易日收益率的标准差折算成年化水平，用于观察短期波动强弱。',
  drawdown: '价格回撤表示指数当前价格距离历史阶段高点下跌了多少，越低说明回落越深。',
  volume: '成交量图用于观察量价配合，放量上涨或放量下跌通常代表资金参与度提升。',
}

const code = computed(() => route.params.code as IndexCode)

onMounted(async () => {
  await dataStore.ensureManifest()
  await dataStore.ensureIndexSeries(code.value)
})

const meta = computed(() => dataStore.getIndexMeta(code.value))
const series = computed(() => dataStore.indexSeriesMap[code.value] ?? [])

const summary = computed(() => {
  const closes = series.value.map((item) => item.close)
  const latest = closes.at(-1) ?? 0
  return {
    latest,
    highest: closes.length ? Math.max(...closes) : 0,
    lowest: closes.length ? Math.min(...closes) : 0,
    oneYearReturn: closes.length > 252 ? percentChange(closes.at(-253) ?? closes[0], latest) : null,
  }
})

const priceChartOptions = computed(() =>
  createChartOptions({
    title: `${meta.value?.shortName ?? ''} 长期价格`,
    dates: series.value.map((item) => item.date),
    series: [
      {
        type: 'line',
        name: '收盘价',
        smooth: true,
        showSymbol: false,
        data: series.value.map((item) => item.close),
      },
      {
        type: 'line',
        name: '开盘价',
        smooth: true,
        showSymbol: false,
        data: series.value.map((item) => item.open),
      },
    ],
  }),
)

const returnChartOptions = computed(() => {
  const returns = calcReturnFromBase(series.value)
  return createChartOptions({
    title: '区间收益率',
    dates: returns.map((item) => item.date),
    valueFormatter: 'percent',
    series: [
      {
        type: 'line',
        name: '累计收益',
        smooth: true,
        showSymbol: false,
        data: returns.map((item) => item.returnRate * 100),
      },
    ],
  })
})

const rollingVolChartOptions = computed(() => {
  const windows = rollingWindow(series.value, 21)
  return createChartOptions({
    title: '21日滚动波动率',
    dates: windows.map((window) => window.at(-1)?.date ?? ''),
    valueFormatter: 'percent',
    series: [
      {
        type: 'line',
        name: '滚动波动率',
        smooth: true,
        showSymbol: false,
        data: windows.map((window) => {
          const returns = window.slice(1).map((point, index) => point.close / window[index].close - 1)
          const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length
          const variance =
            returns.length < 2
              ? 0
              : returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1)
          return Math.sqrt(variance) * Math.sqrt(252) * 100
        }),
      },
    ],
  })
})

const drawdownChartOptions = computed(() => {
  let peak = 0
  const drawdownSeries = series.value.map((point) => {
    peak = Math.max(peak, point.close)
    return peak === 0 ? 0 : (point.close / peak - 1) * 100
  })
  return createChartOptions({
    title: '价格回撤',
    dates: series.value.map((item) => item.date),
    valueFormatter: 'percent',
    series: [
      {
        type: 'line',
        areaStyle: { opacity: 0.08 },
        name: '回撤',
        smooth: true,
        showSymbol: false,
        data: drawdownSeries,
      },
    ],
  })
})

const volumeChartOptions = computed(() =>
  createDualAxisChartOptions(
    '价格与成交量',
    series.value.map((item) => item.date),
    [
      {
        type: 'bar',
        name: '成交量',
        data: series.value.map((item) => item.volume ?? 0),
      },
    ],
    [
      {
        type: 'line',
        name: '收盘价',
        smooth: true,
        showSymbol: false,
        data: series.value.map((item) => item.close),
      },
    ],
  ),
)
</script>

<template>
  <AppShell>
    <section
      v-if="meta"
      class="detail"
    >
      <div class="detail__hero panel">
        <div>
          <div class="detail__name">
            {{ meta.name }}
          </div>
          <div class="detail__desc">
            {{ meta.description }}
          </div>
        </div>
        <div class="detail__headline">
          {{ formatNumber(summary.latest) }}
        </div>
      </div>

      <div class="detail__stats">
        <article class="panel">
          <span>起始日期</span>
          <strong>{{ formatDate(meta.startDate) }}</strong>
        </article>
        <article class="panel">
          <span class="detail__inline-label">
            历史最高
            <InfoTip
              title="历史最高"
              :content="explainers.highest"
            />
          </span>
          <strong>{{ formatNumber(summary.highest) }}</strong>
        </article>
        <article class="panel">
          <span class="detail__inline-label">
            历史最低
            <InfoTip
              title="历史最低"
              :content="explainers.lowest"
            />
          </span>
          <strong>{{ formatNumber(summary.lowest) }}</strong>
        </article>
        <article class="panel">
          <span class="detail__inline-label">
            近1年表现
            <InfoTip
              title="近1年表现"
              :content="explainers.oneYearReturn"
            />
          </span>
          <strong>{{ formatPercent(summary.oneYearReturn) }}</strong>
        </article>
      </div>

      <div class="detail__stats">
        <article class="panel">
          <span class="detail__inline-label">
            数据质量
            <InfoTip
              title="数据质量"
              :content="explainers.quality"
            />
          </span>
          <strong>{{ formatValidationStatus(meta.dataQuality.validationStatus) }}</strong>
        </article>
        <article class="panel">
          <span class="detail__inline-label">
            点数
            <InfoTip
              title="点数"
              :content="explainers.pointCount"
            />
          </span>
          <strong>{{ formatNumber(meta.pointCount, 0) }}</strong>
        </article>
        <article class="panel">
          <span class="detail__inline-label">
            疑似缺口
            <InfoTip
              title="疑似缺口"
              :content="explainers.missingRange"
            />
          </span>
          <strong>{{ formatNumber(meta.dataQuality.missingRangeCount, 0) }}</strong>
        </article>
        <article class="panel">
          <span class="detail__inline-label">
            滞后
            <InfoTip
              title="滞后"
              :content="explainers.staleDays"
            />
          </span>
          <strong>{{ formatDays(meta.dataQuality.staleDays) }}</strong>
        </article>
      </div>

      <div class="detail__charts">
        <div class="panel">
          <VChart
            autoresize
            class="detail__chart"
            :option="priceChartOptions"
          />
        </div>
        <div class="panel">
          <div class="detail__chart-head">
            <h3>区间收益率</h3>
            <InfoTip
              title="区间收益率"
              :content="explainers.returnChart"
            />
          </div>
          <VChart
            autoresize
            class="detail__chart"
            :option="returnChartOptions"
          />
        </div>
        <div class="panel">
          <div class="detail__chart-head">
            <h3>滚动波动率</h3>
            <InfoTip
              title="21日滚动波动率"
              :content="explainers.rollingVol"
            />
          </div>
          <VChart
            autoresize
            class="detail__chart"
            :option="rollingVolChartOptions"
          />
        </div>
        <div class="panel">
          <div class="detail__chart-head">
            <h3>价格回撤</h3>
            <InfoTip
              title="价格回撤"
              :content="explainers.drawdown"
            />
          </div>
          <VChart
            autoresize
            class="detail__chart"
            :option="drawdownChartOptions"
          />
        </div>
        <div class="panel detail__chart--full">
          <div class="detail__chart-head">
            <h3>价格与成交量</h3>
            <InfoTip
              title="成交量"
              :content="explainers.volume"
            />
          </div>
          <VChart
            autoresize
            class="detail__chart"
            :option="volumeChartOptions"
          />
        </div>
      </div>

      <div class="panel">
        <div class="detail__table-head">
          <div>
            <h3>最近 240 个交易日</h3>
            <p>{{ meta.dataQuality.message }}</p>
          </div>
        </div>
        <el-table :data="series.slice(-240)">
          <el-table-column
            prop="date"
            label="日期"
            min-width="140"
          />
          <el-table-column
            prop="open"
            label="开盘"
            min-width="120"
          />
          <el-table-column
            prop="high"
            label="最高"
            min-width="120"
          />
          <el-table-column
            prop="low"
            label="最低"
            min-width="120"
          />
          <el-table-column
            prop="close"
            label="收盘"
            min-width="120"
          />
          <el-table-column
            prop="volume"
            label="成交量"
            min-width="140"
          />
        </el-table>
      </div>
    </section>
  </AppShell>
</template>

<style scoped lang="scss">
.panel {
  border: 1px solid var(--cow-border);
  border-radius: var(--cow-radius);
  padding: 20px;
  background: var(--cow-surface);
  box-shadow: var(--cow-shadow);
}

.detail {
  display: grid;
  gap: 18px;
}

.detail__hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-end;
}

.detail__name {
  font-size: 28px;
  font-weight: 900;
}

.detail__desc,
.detail__table-head p {
  margin-top: 12px;
  color: var(--cow-text-soft);
}

.detail__headline {
  font-size: 48px;
  font-weight: 900;
}

.detail__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.detail__stats span {
  color: var(--cow-text-soft);
}

.detail__inline-label,
.detail__chart-head {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.detail__stats strong {
  display: block;
  margin-top: 8px;
  font-size: 24px;
}

.detail__charts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.detail__chart {
  height: 340px;
}

.detail__chart--full {
  grid-column: 1 / -1;
}

@media (max-width: 1023px) {
  .detail__stats,
  .detail__charts {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .detail__hero {
    display: grid;
    grid-template-columns: 1fr;
  }

  .detail__headline {
    font-size: 36px;
  }

  .detail__chart {
    height: 300px;
  }
}
</style>
