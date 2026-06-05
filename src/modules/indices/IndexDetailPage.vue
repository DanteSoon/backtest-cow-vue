<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import VChart from 'vue-echarts'
import AppShell from '@/shared/components/AppShell.vue'
import { useDataStore } from '@/shared/stores/data'
import type { IndexCode } from '@/shared/types/domain'
import { createChartOptions, createDualAxisChartOptions } from '@/shared/utils/chart'
import { formatDate, formatDays, formatNumber, formatPercent } from '@/shared/utils/formatters'
import { percentChange } from '@/shared/utils/math'
import { calcReturnFromBase, rollingWindow } from '@/shared/utils/series'

const route = useRoute()
const dataStore = useDataStore()

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
    <section v-if="meta" class="detail">
      <div class="detail__hero panel">
        <div>
          <div class="detail__name">{{ meta.name }}</div>
          <div class="detail__desc">{{ meta.description }}</div>
        </div>
        <div class="detail__headline">{{ formatNumber(summary.latest) }}</div>
      </div>

      <div class="detail__stats">
        <article class="panel">
          <span>起始日期</span>
          <strong>{{ formatDate(meta.startDate) }}</strong>
        </article>
        <article class="panel">
          <span>历史最高</span>
          <strong>{{ formatNumber(summary.highest) }}</strong>
        </article>
        <article class="panel">
          <span>历史最低</span>
          <strong>{{ formatNumber(summary.lowest) }}</strong>
        </article>
        <article class="panel">
          <span>近1年表现</span>
          <strong>{{ formatPercent(summary.oneYearReturn) }}</strong>
        </article>
      </div>

      <div class="detail__stats">
        <article class="panel">
          <span>数据质量</span>
          <strong>{{ meta.dataQuality.validationStatus }}</strong>
        </article>
        <article class="panel">
          <span>点数</span>
          <strong>{{ formatNumber(meta.pointCount, 0) }}</strong>
        </article>
        <article class="panel">
          <span>疑似缺口</span>
          <strong>{{ formatNumber(meta.dataQuality.missingRangeCount, 0) }}</strong>
        </article>
        <article class="panel">
          <span>滞后</span>
          <strong>{{ formatDays(meta.dataQuality.staleDays) }}</strong>
        </article>
      </div>

      <div class="detail__charts">
        <div class="panel"><VChart autoresize class="detail__chart" :option="priceChartOptions" /></div>
        <div class="panel"><VChart autoresize class="detail__chart" :option="returnChartOptions" /></div>
        <div class="panel"><VChart autoresize class="detail__chart" :option="rollingVolChartOptions" /></div>
        <div class="panel"><VChart autoresize class="detail__chart" :option="drawdownChartOptions" /></div>
        <div class="panel detail__chart--full"><VChart autoresize class="detail__chart" :option="volumeChartOptions" /></div>
      </div>

      <div class="panel">
        <div class="detail__table-head">
          <div>
            <h3>最近 240 个交易日</h3>
            <p>{{ meta.dataQuality.message }}</p>
          </div>
        </div>
        <el-table :data="series.slice(-240)">
          <el-table-column prop="date" label="日期" min-width="140" />
          <el-table-column prop="open" label="开盘" min-width="120" />
          <el-table-column prop="high" label="最高" min-width="120" />
          <el-table-column prop="low" label="最低" min-width="120" />
          <el-table-column prop="close" label="收盘" min-width="120" />
          <el-table-column prop="volume" label="成交量" min-width="140" />
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
