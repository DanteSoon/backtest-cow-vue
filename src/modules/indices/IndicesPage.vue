<script setup lang="ts">
import { onMounted } from 'vue'
import AppShell from '@/shared/components/AppShell.vue'
import InfoTip from '@/shared/components/InfoTip.vue'
import { useDataStore } from '@/shared/stores/data'
import { formatCurrencyLabel, formatDays, formatNumber, formatValidationStatus } from '@/shared/utils/formatters'

const dataStore = useDataStore()

const explainers = {
  price: '最新点位为当前本地快照中的最近收盘价，用来快速观察指数大致所处位置。',
  pointCount: '点数表示本地已保存的交易日数据条数，越多通常代表历史覆盖越长。',
  staleDays: '滞后表示距离最近一个应更新交易日还差多少个工作日，越大说明数据越旧。',
}

onMounted(async () => {
  await dataStore.ensureManifest()
})
</script>

<template>
  <AppShell>
    <section class="indices-grid">
      <article
        v-for="index in dataStore.manifest?.indices ?? []"
        :key="index.code"
        class="index-card"
      >
        <div class="index-card__top">
          <div>
            <div class="index-card__title">
              {{ index.shortName }}
            </div>
            <div class="index-card__desc">
              {{ index.description }}
            </div>
          </div>
          <div
            class="index-card__badge"
            :class="`is-${index.dataQuality.validationStatus}`"
          >
            {{ formatValidationStatus(index.dataQuality.validationStatus) }}
          </div>
        </div>
        <div class="index-card__price">
          {{ formatNumber(index.latestClose) }}
          <InfoTip
            title="最新点位"
            :content="explainers.price"
          />
        </div>
        <div class="index-card__meta">
          <span>{{ index.startDate }} ~ {{ index.latestDate }}</span>
          <span>{{ formatCurrencyLabel(index.currency) }}</span>
        </div>
        <div class="index-card__meta">
          <span class="index-card__inline-label">
            点数 {{ formatNumber(index.pointCount, 0) }}
            <InfoTip
              title="点数"
              :content="explainers.pointCount"
            />
          </span>
          <span class="index-card__inline-label">
            滞后 {{ formatDays(index.dataQuality.staleDays) }}
            <InfoTip
              title="滞后"
              :content="explainers.staleDays"
            />
          </span>
        </div>
        <div class="index-card__quality">
          {{ index.dataQuality.message }}
        </div>
        <RouterLink
          class="index-card__link"
          :to="`/indices/${index.code}`"
        >
          进入详情
        </RouterLink>
      </article>
    </section>
  </AppShell>
</template>

<style scoped lang="scss">
.indices-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.index-card {
  display: grid;
  gap: 12px;
  border: 1px solid var(--cow-border);
  border-radius: var(--cow-radius);
  padding: 20px;
  background: var(--cow-surface);
  box-shadow: var(--cow-shadow);
}

.index-card__top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.index-card__title {
  font-size: 20px;
  font-weight: 800;
}

.index-card__price,
.index-card__inline-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.index-card__desc,
.index-card__meta,
.index-card__quality {
  color: var(--cow-text-soft);
}

.index-card__badge {
  align-self: flex-start;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  background: rgba(15, 118, 110, 0.12);
}

.index-card__badge.is-warning {
  background: rgba(201, 138, 46, 0.14);
}

.index-card__badge.is-error {
  color: #b42318;
  background: rgba(217, 72, 65, 0.14);
}

.index-card__price {
  font-size: 32px;
  font-weight: 900;
}

.index-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.index-card__link {
  color: var(--cow-primary);
  font-weight: 700;
}

@media (max-width: 767px) {
  .indices-grid {
    grid-template-columns: 1fr;
  }

  .index-card__meta {
    display: grid;
  }
}
</style>
