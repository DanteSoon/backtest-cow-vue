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

export const formatNullableNumber = (value: number | null, fractionDigits = 2) =>
  value == null ? '--' : formatNumber(value, fractionDigits)

export const formatDays = (value: number | null) =>
  value == null ? '--' : `${formatNumber(value, 0)} 天`
