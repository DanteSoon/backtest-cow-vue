import { ref } from 'vue'
import type { BacktestParams, FxPoint, PricePoint } from '@/shared/types/domain'
import { runBacktestEngine } from '@/shared/utils/backtest-engine'

export const useBacktestWorker = () => {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const runBacktest = async (
    params: BacktestParams,
    series: PricePoint[],
    fxSeries: FxPoint[],
    currency: 'USD' | 'CNY',
  ) => {
    loading.value = true
    error.value = null

    try {
      const result = await Promise.resolve(runBacktestEngine(params, series, fxSeries, currency))
      return result
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '回测失败'
      throw reason
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    runBacktest,
  }
}
