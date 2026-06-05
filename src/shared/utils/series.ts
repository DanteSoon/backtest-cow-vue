import dayjs from 'dayjs'
import type { FxPoint, PricePoint } from '@/shared/types/domain'

export const sortByDate = <T extends { date: string }>(items: T[]) =>
  [...items].sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf())

export const findFirstTradingDateOnOrAfter = (targetDate: string, series: PricePoint[]) => {
  const target = dayjs(targetDate)
  return series.find((point) => !dayjs(point.date).isBefore(target))
}

export const alignFxRate = (date: string, fxSeries: FxPoint[]) => {
  const target = dayjs(date)
  let matched = fxSeries[0]
  for (const point of fxSeries) {
    if (dayjs(point.date).isAfter(target)) break
    matched = point
  }
  return matched
}

export const rollingWindow = <T>(items: T[], size: number) => {
  if (size <= 0 || items.length < size) return []
  const windows: T[][] = []
  for (let index = 0; index <= items.length - size; index += 1) {
    windows.push(items.slice(index, index + size))
  }
  return windows
}

export const calcReturnFromBase = (series: PricePoint[]) => {
  const base = series[0]?.close
  if (!base) return []
  return series.map((point) => ({
    date: point.date,
    returnRate: point.close / base - 1,
  }))
}
