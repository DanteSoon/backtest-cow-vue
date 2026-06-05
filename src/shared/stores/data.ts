import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DataManifest, FxPoint, IndexCode, PricePoint, ValidationStatus } from '@/shared/types/domain'
import { fetchFxSeries, fetchIndexSeries, fetchManifest } from '@/shared/utils/data-service'

export const useDataStore = defineStore('data', () => {
  const manifest = ref<DataManifest | null>(null)
  const indexSeriesMap = ref<Partial<Record<IndexCode, PricePoint[]>>>({})
  const fxSeries = ref<FxPoint[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const ensureManifest = async () => {
    if (manifest.value) return manifest.value
    loading.value = true
    try {
      error.value = null
      manifest.value = await fetchManifest()
      return manifest.value
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '加载指数清单失败'
      throw reason
    } finally {
      loading.value = false
    }
  }

  const ensureIndexSeries = async (code: IndexCode) => {
    if (indexSeriesMap.value[code]) return indexSeriesMap.value[code]!
    const currentManifest = await ensureManifest()
    try {
      error.value = null
      const bundle = await fetchIndexSeries(code, currentManifest)
      indexSeriesMap.value[code] = bundle.series
      return bundle.series
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : `加载 ${code} 数据失败`
      throw reason
    }
  }

  const ensureFxSeries = async () => {
    if (fxSeries.value.length > 0) return fxSeries.value
    try {
      error.value = null
      fxSeries.value = await fetchFxSeries()
      return fxSeries.value
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '加载汇率数据失败'
      throw reason
    }
  }

  const getIndexMeta = (code: IndexCode) =>
    manifest.value?.indices.find((item) => item.code === code) ?? null

  const getQualityStatus = (code: IndexCode): ValidationStatus | null =>
    getIndexMeta(code)?.dataQuality.validationStatus ?? null

  return {
    manifest,
    indexSeriesMap,
    fxSeries,
    loading,
    error,
    ensureManifest,
    ensureIndexSeries,
    ensureFxSeries,
    getIndexMeta,
    getQualityStatus,
  }
})
