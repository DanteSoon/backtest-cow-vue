import type { EChartsOption, LineSeriesOption, BarSeriesOption, ScatterSeriesOption } from 'echarts'
import { formatNumber, formatPercent } from '@/shared/utils/formatters'

export type ChartSeries = LineSeriesOption | BarSeriesOption | ScatterSeriesOption
export type ValueFormatter = 'number' | 'percent' | 'compact'

const formatValue = (value: number, formatter: ValueFormatter) => {
  if (formatter === 'percent') return formatPercent(value / 100)
  if (formatter === 'compact') return formatNumber(value, 0)
  return formatNumber(value)
}

interface ChartFactoryOptions {
  title: string
  dates: string[]
  series: ChartSeries[]
  valueFormatter?: ValueFormatter
  xBoundaryGap?: boolean
  legend?: boolean
  yAxis?: EChartsOption['yAxis']
}

export const createChartOptions = ({
  title,
  dates,
  series,
  valueFormatter = 'number',
  xBoundaryGap = false,
  legend = true,
  yAxis,
}: ChartFactoryOptions): EChartsOption => ({
  animationDuration: 350,
  color: ['#0f766e', '#c98a2e', '#173b39', '#d94841', '#2f8f67'],
  title: {
    text: title,
    left: 0,
    textStyle: {
      fontSize: 14,
      fontWeight: 700,
      color: '#173b39',
    },
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255, 253, 250, 0.96)',
    borderColor: '#dccfb7',
    textStyle: {
      color: '#173b39',
    },
    formatter: (params) => {
      const normalized = Array.isArray(params) ? params : [params]
      const axisLabel = String((normalized[0] as { axisValueLabel?: string } | undefined)?.axisValueLabel ?? '')
      const lines = [`<strong>${axisLabel}</strong>`]
      for (const item of normalized) {
        const rawValue = Array.isArray(item.value) ? Number(item.value.at(-1) ?? 0) : Number(item.value ?? 0)
        const marker = String((item as { marker?: string }).marker ?? '')
        lines.push(`${marker}${item.seriesName ?? ''}：${formatValue(rawValue, valueFormatter)}`)
      }
      return lines.join('<br/>')
    },
  },
  legend: legend
    ? {
        top: 26,
        itemGap: 18,
      }
    : undefined,
  toolbox: {
    right: 0,
    feature: {
      saveAsImage: {},
      dataZoom: {},
      restore: {},
    },
  },
  grid: {
    left: 18,
    right: 18,
    top: legend ? 72 : 52,
    bottom: 58,
    containLabel: true,
  },
  dataZoom: [
    { type: 'inside' },
    { type: 'slider', height: 18, bottom: 12 },
  ],
  xAxis: {
    type: 'category',
    boundaryGap: xBoundaryGap,
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#cbbda5' } },
    axisLabel: { color: '#5f716f' },
    data: dates,
  },
  yAxis:
    yAxis ??
    {
      type: 'value',
      scale: true,
      axisLine: { show: false },
      axisLabel: {
        color: '#5f716f',
        formatter: (value: number) => formatValue(value, valueFormatter),
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(220, 207, 183, 0.5)',
        },
      },
    },
  series,
})

export const createDualAxisChartOptions = (
  title: string,
  dates: string[],
  leftSeries: ChartSeries[],
  rightSeries: ChartSeries[],
): EChartsOption =>
  createChartOptions({
    title,
    dates,
    series: [
      ...leftSeries.map((item) => ({ ...item, yAxisIndex: 0 })),
      ...rightSeries.map((item) => ({ ...item, yAxisIndex: 1 })),
    ],
    yAxis: [
      {
        type: 'value',
        scale: true,
        axisLabel: {
          color: '#5f716f',
          formatter: (value: number) => formatNumber(value),
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(220, 207, 183, 0.5)',
          },
        },
      },
      {
        type: 'value',
        scale: true,
        axisLabel: {
          color: '#5f716f',
          formatter: (value: number) => formatPercent(value / 100),
        },
        splitLine: { show: false },
      },
    ],
  })
