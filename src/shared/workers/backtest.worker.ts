import type { BacktestParams, FxPoint, PricePoint } from '@/shared/types/domain'
import { runBacktestEngine } from '@/shared/utils/backtest-engine'

interface WorkerRequest {
  params: BacktestParams
  series: PricePoint[]
  fxSeries: FxPoint[]
  currency: 'USD' | 'CNY'
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { params, series, fxSeries, currency } = event.data

  try {
    const result = runBacktestEngine(params, series, fxSeries, currency)
    self.postMessage({ ok: true, result })
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : '未知错误',
    })
  }
}
