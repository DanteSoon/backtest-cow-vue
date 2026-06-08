import { ref } from 'vue'
import type { BacktestDataset, BacktestParams, FxPoint } from '@/shared/types/domain'
import { runBacktestEngine } from '@/shared/utils/backtest-engine'

export const useBacktestWorker = () => {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const runBacktest = async (
    params: BacktestParams,
    dataset: BacktestDataset,
    fxSeries: FxPoint[],
  ) => {
    loading.value = true
    error.value = null

    try {
      const result = await Promise.resolve(runBacktestEngine(params, dataset, fxSeries))
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
