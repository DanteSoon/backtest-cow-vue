import dayjs from 'dayjs'
import { CONFIRMED_TRADING_CLOSURES } from './trading-closures.mjs'

const FIELD_NAMES = ['open', 'high', 'low', 'close', 'volume']

const isWeekend = (date) => {
  const day = dayjs(date).day()
  return day === 0 || day === 6
}

const businessDatesBetween = (startDate, endDate) => {
  const dates = []
  let cursor = dayjs(startDate).add(1, 'day')
  const end = dayjs(endDate)

  while (cursor.isBefore(end, 'day')) {
    if (!isWeekend(cursor)) {
      dates.push(cursor.format('YYYY-MM-DD'))
    }
    cursor = cursor.add(1, 'day')
  }

  return dates
}

const gapTolerance = {
  US: 3,
  CN: 4,
}

const isWithinClosure = (date, closure) => date >= closure.startDate && date <= closure.endDate

const normalizeMissingRange = (dates) => ({
  startDate: dates[0],
  endDate: dates.at(-1),
  missingDays: dates.length,
})

const splitMissingDatesByConfirmedClosures = (missingDates, tradingCalendar) => {
  if (missingDates.length === 0) {
    return { confirmed: [], unresolved: [] }
  }

  const closures = CONFIRMED_TRADING_CLOSURES[tradingCalendar] ?? []
  const confirmedBuckets = new Map()
  const unresolved = []

  for (const date of missingDates) {
    const matched = closures.find((closure) => isWithinClosure(date, closure))
    if (matched) {
      const key = `${matched.startDate}:${matched.endDate}:${matched.reason}`
      const bucket = confirmedBuckets.get(key) ?? {
        startDate: matched.startDate,
        endDate: matched.endDate,
        reason: matched.reason,
        dates: [],
      }
      bucket.dates.push(date)
      confirmedBuckets.set(key, bucket)
    } else {
      unresolved.push(date)
    }
  }

  return {
    confirmed: [...confirmedBuckets.values()].map((bucket) => ({
      startDate: bucket.startDate,
      endDate: bucket.endDate,
      reason: bucket.reason,
      missingDays: bucket.dates.length,
    })),
    unresolved: unresolved.length > 0 ? [normalizeMissingRange(unresolved)] : [],
  }
}

export const round = (value, digits = 6) => Number(value.toFixed(digits))

export const normalizePricePoint = (point) => {
  const close = Number(point.close)
  const open = Number.isFinite(Number(point.open)) ? Number(point.open) : close
  const high = Number.isFinite(Number(point.high)) ? Number(point.high) : Math.max(open, close)
  const low = Number.isFinite(Number(point.low)) ? Number(point.low) : Math.min(open, close)
  const volume = Number.isFinite(Number(point.volume)) ? Number(point.volume) : null

  return {
    date: String(point.date),
    open: round(open, 4),
    high: round(Math.max(open, high, close), 4),
    low: round(Math.min(open, low, close), 4),
    close: round(close, 4),
    volume: volume == null ? null : round(volume, 2),
  }
}

export const dedupeAndSortSeries = (series) => {
  const map = new Map()
  for (const raw of series) {
    if (!raw?.date) continue
    const point = normalizePricePoint(raw)
    if (!Number.isFinite(point.close)) continue
    map.set(point.date, point)
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export const buildFieldCoverage = (series) => {
  if (series.length === 0) {
    return {
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
    }
  }

  const totals = Object.fromEntries(FIELD_NAMES.map((field) => [field, 0]))

  for (const point of series) {
    for (const field of FIELD_NAMES) {
      if (point[field] !== null && Number.isFinite(point[field])) {
        totals[field] += 1
      }
    }
  }

  return {
    open: round(totals.open / series.length, 4),
    high: round(totals.high / series.length, 4),
    low: round(totals.low / series.length, 4),
    close: round(totals.close / series.length, 4),
    volume: round(totals.volume / series.length, 4),
  }
}

export const detectMissingDateRanges = (series, tradingCalendar) => {
  const unresolvedRanges = []
  const confirmedClosures = []
  if (series.length < 2) {
    return {
      unresolvedRanges,
      confirmedClosures,
    }
  }

  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1]
    const current = series[index]
    const missingDates = businessDatesBetween(previous.date, current.date)

    if (missingDates.length > gapTolerance[tradingCalendar]) {
      const { confirmed, unresolved } = splitMissingDatesByConfirmedClosures(
        missingDates,
        tradingCalendar,
      )
      confirmedClosures.push(...confirmed)
      unresolvedRanges.push(...unresolved)
    }
  }

  return {
    unresolvedRanges,
    confirmedClosures,
  }
}

export const countBusinessDaysSince = (date) => {
  if (!date) return 0
  let days = 0
  let cursor = dayjs(date).add(1, 'day')
  const end = dayjs()

  while (!cursor.isAfter(end, 'day')) {
    if (!isWeekend(cursor)) {
      days += 1
    }
    cursor = cursor.add(1, 'day')
  }

  return days
}

export const assessSeriesQuality = (series, tradingCalendar) => {
  const fieldCoverage = buildFieldCoverage(series)
  const { unresolvedRanges, confirmedClosures } = detectMissingDateRanges(series, tradingCalendar)
  const staleDays = countBusinessDaysSince(series.at(-1)?.date)

  const fieldIssues = FIELD_NAMES.filter((field) => {
    if (field === 'volume') return false
    return fieldCoverage[field] < 1
  })
  const warnings = []

  if (staleDays > 5) warnings.push(`数据距离最新交易日约 ${staleDays} 个工作日`)
  if (unresolvedRanges.length > 0) warnings.push(`发现 ${unresolvedRanges.length} 段真实缺口`)
  if (confirmedClosures.length > 0) warnings.push(`确认 ${confirmedClosures.length} 段停市区间`)
  if (fieldCoverage.volume < 0.6) warnings.push('成交量覆盖率较低')

  const issueCount = fieldIssues.length + unresolvedRanges.length + warnings.length
  const validationStatus =
    fieldIssues.length > 0 ? 'error' : issueCount > 0 ? 'warning' : 'ok'

  return {
    validationStatus,
    staleDays,
    pointCount: series.length,
    missingRangeCount: unresolvedRanges.length,
    missingDateRanges: unresolvedRanges,
    confirmedClosures,
    fieldCoverage,
    issueCount,
    hasSuspiciousGaps: unresolvedRanges.length > 0,
    message:
      validationStatus === 'ok' && confirmedClosures.length === 0
        ? '数据完整'
        : warnings.join('；') || '数据存在待检查项',
  }
}
