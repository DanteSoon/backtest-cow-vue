import type { AssetCurrency, StrategyKind, ValidationStatus } from '@/shared/types/domain'

export const formatNumber = (value: number, fractionDigits = 2) =>
  new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)

export const formatCompactNumber = (value: number, fractionDigits = 1) =>
  new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)

export const formatPercent = (value: number | null, fractionDigits = 2) =>
  value == null
    ? '--'
    : new Intl.NumberFormat('zh-CN', {
        style: 'percent',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(value)

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))

export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))

export const formatNullableNumber = (value: number | null, fractionDigits = 2) =>
  value == null ? '--' : formatNumber(value, fractionDigits)

export const formatDays = (value: number | null) =>
  value == null ? '--' : `${formatNumber(value, 0)} 天`

export const formatValidationStatus = (value: ValidationStatus | null | undefined) => {
  if (value === 'ok') return '正常'
  if (value === 'warning') return '提示'
  if (value === 'error') return '异常'
  return '--'
}

export const formatStrategyKind = (value: StrategyKind | null | undefined) => {
  if (value === 'dca') return '组合定投'
  if (value === 'manual') return '普通买卖'
  return '--'
}

export const formatTradeSide = (value: 'buy' | 'sell' | null | undefined) => {
  if (value === 'buy') return '买入'
  if (value === 'sell') return '卖出'
  return '--'
}

export const formatCurrencyLabel = (value: AssetCurrency | null | undefined) => {
  if (value === 'CNY') return '人民币'
  if (value === 'USD') return '美元'
  return '--'
}
