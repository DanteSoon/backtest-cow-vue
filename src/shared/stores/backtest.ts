import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import type { BacktestParams, BacktestResult, DcaParams, ManualParams } from '@/shared/types/domain'
import { DEFAULT_INDEX_CODE } from '@/shared/constants/indices'
import { readJsonStorage, writeJsonStorage } from '@/shared/utils/storage'

const STORAGE_KEY = 'backtest-cow-vue:recent-backtests'

export const createDefaultDcaParams = (): DcaParams => ({
  kind: 'dca',
  indexCode: DEFAULT_INDEX_CODE,
  startDate: dayjs().subtract(10, 'year').format('YYYY-MM-DD'),
  endDate: dayjs().format('YYYY-MM-DD'),
  amountCny: 2000,
  frequency: 'monthly',
  feeRate: 0,
  feeFixed: 0,
  slippageBps: 0,
})

export const createDefaultManualParams = (): ManualParams => ({
  kind: 'manual',
  indexCode: DEFAULT_INDEX_CODE,
  initialCashCny: 100000,
  feeRate: 0,
  feeFixed: 0,
  slippageBps: 0,
  trades: [
    {
      date: dayjs().subtract(5, 'year').format('YYYY-MM-DD'),
      side: 'buy',
      valueMode: 'cash',
      value: 100000,
      feeRate: 0,
      feeFixed: 0,
      slippageBps: 0,
    },
  ],
})

export interface RecentBacktestRecord {
  id: string
  createdAt: string
  params: BacktestParams
  summary: BacktestResult['summary']
}

const cloneParams = (params: BacktestParams): BacktestParams => JSON.parse(JSON.stringify(params))

export const useBacktestStore = defineStore('backtest', () => {
  const params = ref<BacktestParams>(createDefaultDcaParams())
  const result = ref<BacktestResult | null>(null)
  const running = ref(false)
  const recent = ref<RecentBacktestRecord[]>(
    readJsonStorage<RecentBacktestRecord[]>(STORAGE_KEY, []),
  )

  watch(
    recent,
    (value) => {
      writeJsonStorage(STORAGE_KEY, value)
    },
    { deep: true },
  )

  const setStrategyKind = (kind: BacktestParams['kind']) => {
    params.value = kind === 'dca' ? createDefaultDcaParams() : createDefaultManualParams()
  }

  const setParams = (nextParams: BacktestParams) => {
    params.value = nextParams
  }

  const saveRecent = (summary: BacktestResult['summary']) => {
    recent.value = [
      {
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        params: cloneParams(params.value),
        summary,
      },
      ...recent.value,
    ].slice(0, 5)
  }

  const currentKind = computed(() => params.value.kind)

  return {
    params,
    result,
    running,
    recent,
    currentKind,
    setStrategyKind,
    setParams,
    saveRecent,
  }
})
