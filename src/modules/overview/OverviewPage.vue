<script setup lang="ts">
import { computed, onMounted } from 'vue'
import VChart from 'vue-echarts'
import AppShell from '@/shared/components/AppShell.vue'
import { useDataStore } from '@/shared/stores/data'
import { createChartOptions } from '@/shared/utils/chart'
import { formatDays, formatNumber, formatPercent } from '@/shared/utils/formatters'
import { percentChange } from '@/shared/utils/math'

const dataStore = useDataStore()

onMounted(async () => {
  await dataStore.ensureManifest()
  await dataStore.ensureFxSeries()
  await Promise.all(dataStore.manifest?.indices.map((index) => dataStore.ensureIndexSeries(index.code)) ?? [])
})

const overviewMetrics = computed(() =>
  (dataStore.manifest?.indices ?? []).map((meta) => {
    const series = dataStore.indexSeriesMap[meta.code] ?? []
    const last = series.at(-1)
    const yearAgo = series.at(Math.max(series.length - 252, 0))
    return {
      ...meta,
      latestClose: last?.close ?? meta.latestClose,
      oneYearReturn: last && yearAgo ? percentChange(yearAgo.close, last.close) : null,
    }
  }),
)

const alignedCompareData = computed(() => {
  const metrics = overviewMetrics.value
  const seriesEntries = metrics
    .map((meta) => ({
      meta,
      series: dataStore.indexSeriesMap[meta.code] ?? [],
    }))
    .filter((entry) => entry.series.length > 0)

  if (seriesEntries.length === 0) {
    return { dates: [], series: [] as { name: string; data: (number | null)[] }[] }
  }

  const commonStartDate = seriesEntries
    .map((entry) => entry.series[0].date)
    .sort()
    .at(-1)
  const commonEndDate = seriesEntries
    .map((entry) => entry.series.at(-1)?.date ?? entry.series[0].date)
    .sort()[0]

  if (!commonStartDate || !commonEndDate || commonStartDate > commonEndDate) {
    return { dates: [], series: [] as { name: string; data: (number | null)[] }[] }
  }

  const referenceDates = seriesEntries
    .find((entry) => entry.series[0].date === commonStartDate)
    ?.series.filter((point) => point.date >= commonStartDate && point.date <= commonEndDate)
    .map((point) => point.date) ?? []

  const alignedSeries = seriesEntries.map((entry) => {
    const filtered = entry.series.filter((point) => point.date >= commonStartDate && point.date <= commonEndDate)
    const pointMap = new Map(filtered.map((point) => [point.date, point.close]))
    const base = filtered[0]?.close ?? 1
    return {
      name: entry.meta.shortName,
      data: referenceDates.map((date) => {
        const close = pointMap.get(date)
        return close == null ? null : ((close / base) - 1) * 100
      }),
    }
  })

  return {
    dates: referenceDates,
    series: alignedSeries,
  }
})

const compareChartOptions = computed(() => {
  return createChartOptions({
    title: '核心指数区间对比',
    dates: alignedCompareData.value.dates,
    valueFormatter: 'percent',
    series: alignedCompareData.value.series.map((series) => ({
      type: 'line',
      name: series.name,
      smooth: true,
      showSymbol: false,
      connectNulls: false,
      data: series.data,
    })),
  })
})
</script>

<template>
  <AppShell>
    <section class="overview">
      <div class="overview__cards">
        <article v-for="metric in overviewMetrics" :key="metric.code" class="overview__card">
          <div class="overview__card-top">
            <div>
              <div class="overview__name">{{ metric.shortName }}</div>
              <div class="overview__full">{{ metric.name }}</div>
            </div>
            <div class="overview__badge" :class="`is-${metric.dataQuality.validationStatus}`">
              {{ metric.dataQuality.validationStatus }}
            </div>
          </div>
          <div class="overview__price">{{ formatNumber(metric.latestClose, 2) }}</div>
          <div class="overview__delta" :class="{ rise: (metric.oneYearReturn ?? 0) >= 0, fall: (metric.oneYearReturn ?? 0) < 0 }">
            近1年 {{ formatPercent(metric.oneYearReturn) }}
          </div>
          <div class="overview__meta-row">
            <span>点数 {{ formatNumber(metric.pointCount, 0) }}</span>
            <span>滞后 {{ formatDays(metric.dataQuality.staleDays) }}</span>
          </div>
          <div class="overview__meta">{{ metric.dataQuality.message }}</div>
          <RouterLink class="overview__detail" :to="`/indices/${metric.code}`">查看指数详情</RouterLink>
        </article>
      </div>

      <div class="overview__panel">
        <VChart autoresize :option="compareChartOptions" class="overview__chart" />
      </div>

      <div class="overview__grid">
        <article class="overview__panel overview__panel--cta">
          <h3>热门回测入口</h3>
          <p>从纳斯达克100月定投、沪深300买入并持有，到策略与基准对比，结果会直接给出风险拆解。</p>
          <RouterLink class="overview__button" to="/backtest">进入回测工作台</RouterLink>
        </article>

        <article class="overview__panel">
          <h3>数据说明</h3>
          <p>指数与汇率都来自本地静态快照，manifest 中包含覆盖区间、点数、缺口和新鲜度判断。</p>
          <div class="overview__meta">最近更新：{{ dataStore.manifest?.updatedAt ?? '--' }}</div>
        </article>
      </div>
    </section>
  </AppShell>
</template>

<style scoped lang="scss">
.overview {
  display: grid;
  gap: 20px;
}

.overview__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.overview__card,
.overview__panel {
  border: 1px solid var(--cow-border);
  border-radius: var(--cow-radius);
  padding: 20px;
  background: var(--cow-surface);
  box-shadow: var(--cow-shadow);
}

.overview__card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.overview__badge {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  background: rgba(15, 118, 110, 0.12);
}

.overview__badge.is-warning {
  background: rgba(201, 138, 46, 0.14);
}

.overview__badge.is-error {
  color: #b42318;
  background: rgba(217, 72, 65, 0.14);
}

.overview__name {
  font-size: 20px;
  font-weight: 800;
}

.overview__full,
.overview__meta {
  color: var(--cow-text-soft);
}

.overview__price {
  margin-top: 16px;
  font-size: 36px;
  font-weight: 900;
}

.overview__detail {
  display: inline-flex;
  margin-top: 14px;
  color: var(--cow-primary);
}

.overview__meta-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  color: var(--cow-text-soft);
}

.overview__delta {
  margin-top: 8px;
}

.overview__delta.rise {
  color: var(--cow-rise);
}

.overview__delta.fall {
  color: var(--cow-fall);
}

.overview__chart {
  height: 420px;
}

.overview__grid {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 16px;
}

.overview__button {
  display: inline-flex;
  margin-top: 16px;
  border-radius: 999px;
  padding: 12px 18px;
  color: #fff;
  background: linear-gradient(135deg, var(--cow-primary), var(--cow-accent));
}

@media (max-width: 1279px) {
  .overview__cards,
  .overview__grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 767px) {
  .overview__cards,
  .overview__grid {
    grid-template-columns: 1fr;
  }

  .overview__chart {
    height: 320px;
  }

  .overview__meta-row {
    display: grid;
  }
}
</style>
