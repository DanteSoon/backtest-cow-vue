import { registerLocale, use } from 'echarts/core'
import zhLocale from 'echarts/i18n/langZH-obj.js'
import { CanvasRenderer } from 'echarts/renderers'
import {
  BarChart,
  LineChart,
  ScatterChart,
} from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  ToolboxComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  ToolboxComponent,
])

registerLocale('ZH', zhLocale)

export const echartsInitOptions = {
  locale: 'ZH',
}
