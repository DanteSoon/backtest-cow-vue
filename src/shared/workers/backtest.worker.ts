import type { BacktestDataset, BacktestParams, FxPoint } from '@/shared/types/domain'
import { runBacktestEngine } from '@/shared/utils/backtest-engine'

interface WorkerRequest {
  params: BacktestParams
  dataset: BacktestDataset
  fxSeries: FxPoint[]
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { params, dataset, fxSeries } = event.data

  try {
    const result = runBacktestEngine(params, dataset, fxSeries)
    self.postMessage({ ok: true, result })
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : '未知错误',
    })
  }
}
